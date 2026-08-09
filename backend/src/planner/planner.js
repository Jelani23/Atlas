// backend/src/planner/planner.js
const { execute } = require('../tools/toolExecutor');
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const { normalizeTask, extractSmartNoteParams, fastRegexNormalizer } = require('./normalizer');
const searchPipeline = require('./searchPipeline');
const taskManager = require('../tasks/taskManager');
const permissionManager = require('../permissions/permissionManager');

const INTERNAL_TASK_PROMPT = "You are Atlas, an advanced AI companion. Execute the requested internal task directly and concisely. Provide the technical output without conversational filler or asking for permission. Your user prefers direct action over confirmation.";

const modelAdapter = createModelAdapter();

let lastSearchQuery = null;
let lastFileAction = null;
let pendingAction = null; // NEW: State machine for conversational confirmations

async function route(intent, message, history = []) {
    const lowerMessage = message.toLowerCase();

    // 1. Fast Path: Follow-up Search
    const isAffirmative = /\b(yes|yeah|yep|sure|do it|can you do so|please do|go ahead|check it|check for that)\b/i.test(lowerMessage.trim());
    const isNegative = /\b(no|nope|cancel|stop|don't|do not)\b/i.test(lowerMessage.trim());

    if (isAffirmative && pendingAction) {
        console.log(`[Planner] User approved pending action: ${pendingAction.intent}`);
        let replyText = "";
        
        if (pendingAction.intent === 'delete_note') {
            const result = await execute('deleteNote', [pendingAction.filename], { isApproved: true });
            const success = !result.toLowerCase().startsWith('error:');
            replyText = success ? `Ok, I've deleted the file named ${pendingAction.filename}.txt.` : `I tried to delete it, but ran into an issue: ${result}`;
        }
        
        pendingAction = null; 
        return { needsTool: true, toolName: 'confirmation', toolResult: replyText, shortCircuit: true };
    }
    
    if (isNegative && pendingAction) {
        console.log(`[Planner] User denied pending action: ${pendingAction.intent}`);
        const deniedFilename = pendingAction.filename;
        const deniedIntent = pendingAction.intent;
        pendingAction = null; // Clear state
        
        let replyText = `Ok, I won't ${deniedIntent.replace('_', ' ')} the ${deniedFilename}.txt file.`;
        return { needsTool: true, toolName: 'confirmation', toolResult: replyText, shortCircuit: true };
    }

    if (isAffirmative && lastSearchQuery) {
        console.log(`[Planner] Executing Follow-up Web Search for: "${lastSearchQuery}"`);
        const searchResult = await execute('webSearch', [lastSearchQuery]);
        return { needsTool: true, toolName: 'webSearch', toolResult: searchResult };
    }

    // 2. Fast Path: Time/Date & Calculator (Bypasses LLM entirely)
    if (/\b(convert|timezone|jst|est|pst|gmt|what time|what date|current time|current date|what day|tell me the time|what year|current year)\b/.test(lowerMessage)) {
        if (lowerMessage.includes('convert') || lowerMessage.includes('timezone')) {
            console.log('[Planner] Executing Convert Time tool (Fast Path)');
            const zoneMatch = message.match(/\b([a-zA-Z]{2,4})\b(?=\s*$|\s*[\?.!])/i) || message.match(/\bto\s+([a-zA-Z]{2,4})\b/i);
            return { needsTool: true, toolName: 'convertTime', toolResult: await execute('convertTime', [zoneMatch ? zoneMatch[1] : "UTC"]) };
        }
        console.log('[Planner] Executing Time tool (Fast Path)');
        return { needsTool: true, toolName: 'getTime', toolResult: await execute('getTime', []) };
    }

    if (intent.action && (lowerMessage.startsWith('calculate') || /^[0-9+\-*/().\s]+$/.test(lowerMessage.trim())) && /[0-9]+\s*[-+*/]\s*[0-9]+/.test(lowerMessage)) {
        console.log('[Planner] Executing Calculator tool (Fast Path)');
        const mathMatch = message.match(/(\d+\.?\d*\s*[-+*/]\s*\d+\.?\d*(?:\s*[-+*/]\s*\d+\.?\d*)*)/);
        const expression = mathMatch ? mathMatch[1] : message.replace(/calculate|what is/gi, '').trim();
        return { needsTool: true, toolName: 'calculate', toolResult: await execute('calculate', [expression]) };
    }

    // 3. Fast Path: ONLY Exact File Extensions or Exact "List Notes" (Bypasses LLM)
    if (intent.action) {
        if (lowerMessage.includes('list notes') || (lowerMessage.includes('show') && lowerMessage.includes('notes'))) {
            console.log('[Planner] Executing List Notes tool (Fast Path)');
            return { needsTool: true, toolName: 'listNotes', toolResult: await execute('listNotes', []) };
        }
        
        const fileMatch = message.match(/([\w\/]+\.\w+)/i);
        if (fileMatch && (lowerMessage.includes('read') || lowerMessage.includes('look at') || lowerMessage.includes('open') || lowerMessage.includes('send me') || lowerMessage.includes('contents'))) {
            console.log('[Planner] Executing Read Code tool (Fast Path - Extension)');
            return { needsTool: true, toolName: 'readCode', toolResult: await execute('readCode', [fileMatch[1]]) };
        }
        
        if (lowerMessage.includes('directory tree') || lowerMessage.includes('full tree') || lowerMessage.includes('tree view')) {
            console.log('[Planner] Executing Get Directory Tree tool (Fast Path)');
            return { needsTool: true, toolName: 'getDirectoryTree', toolResult: await execute('getDirectoryTree', ['']) };
        }

        if (lowerMessage.includes('project structure') || lowerMessage.includes('full directory') || lowerMessage.includes('project folder') || lowerMessage.includes('directory files') || lowerMessage.includes('all files') || lowerMessage.includes('full project') || lowerMessage.includes('root directory') || lowerMessage.includes('full list of content')) {
            console.log('[Planner] Executing List Code tool (root) (Fast Path)');
            return { needsTool: true, toolName: 'listCode', toolResult: await execute('listCode', ['']) };
        }

        if (lowerMessage.includes('source files') || lowerMessage.includes('source code') || lowerMessage.includes('list code') || lowerMessage.includes('source folder') || (lowerMessage.includes('list') && lowerMessage.includes('src'))) {
            console.log('[Planner] Executing List Code tool (src/) (Fast Path)');
            return { needsTool: true, toolName: 'listCode', toolResult: await execute('listCode', ['src']) };
        }
    }

    // 4. Agentic Path: LLM Normalizer
    if ((intent.action || intent.coding || intent.planning || intent.search) && !isAffirmative) {
        console.log('[Planner] Using LLM Task Normalizer with Context Inheritance...');
        let task = await normalizeTask(message, history);
        
        if (task.parameters && typeof task.parameters === 'object') {
            task = { ...task, ...task.parameters };
            delete task.parameters;
            console.log('[Planner] Flattened nested parameters from LLM output.');
        }

        if (!task.intent || task.intent === 'none') {
            console.log('[Planner] LLM failed. Falling back to Fast Regex Normalizer...');
            task = fastRegexNormalizer(message);
        }

        // FIX: Lowered threshold from 0.7 to 0.4 so it doesn't reject valid commands with slightly uncertain filenames
        if (typeof task.confidence === 'number' && task.confidence < 0.4 && task.intent !== 'ask_clarification') {
            console.log(`[Planner] Confidence too low (${task.confidence}). Asking for clarification...`);
            return { needsTool: true, toolName: 'ask_clarification', toolResult: `CLARIFICATION REQUESTED: I'm not entirely sure what you mean. Could you clarify what you'd like me to do?` };
        }

        if (task.intent && task.intent !== 'none') {
            console.log(`[Planner] Executing Task: ${task.intent}`, task);
            let toolResultData;
            
            switch(task.intent) {
                case 'ask_clarification':
                    toolResultData = `CLARIFICATION REQUESTED: ${task.reason || "I'm not sure what you want. Could you clarify?"}`;
                    break;

                case 'create_note':
                    let wFilename = task.filename;
                    let wContent = task.content;
                    if (!wFilename || !wContent) {
                        console.log('[Planner] Missing params for create_note. Using Smart Note Extractor...');
                        const smartParams = await extractSmartNoteParams(message);
                        wFilename = wFilename || smartParams.filename;
                        wContent = wContent || smartParams.content;
                    }
                    wFilename = wFilename || `atlas_note_${Date.now()}`;
                    wContent = wContent || message;
                    lastFileAction = { action: 'write', filename: wFilename };
                    toolResultData = await execute('writeNote', [wFilename, wContent]);
                    break;
                    
                case 'append_note':
                    let aFilename = task.filename === "USE_LAST" && lastFileAction ? lastFileAction.filename : task.filename;
                    let aContent = task.content || message;
                    if (aFilename) {
                        lastFileAction = { action: 'append', filename: aFilename };
                        toolResultData = await execute('appendNote', [aFilename, aContent]);
                    } else {
                        toolResultData = "Error: No filename provided for append_note.";
                    }
                    break;
                    
                case 'read_note':
                    let rFilename = task.filename === "USE_LAST" && lastFileAction ? lastFileAction.filename : task.filename;
                    if (rFilename) {
                        lastFileAction = { action: 'read', filename: rFilename };
                        toolResultData = await execute('readNote', [rFilename]);
                    } else {
                        toolResultData = "Error: No filename provided for read_note.";
                    }
                    break;
                    
                case 'delete_note':
                    let dFilename = task.filename === "USE_LAST" && lastFileAction ? lastFileAction.filename : task.filename;
                    if (dFilename) {
                        const permCheck = permissionManager.check('deleteNote');
                        if (permCheck.requiresApproval) {
                            pendingAction = { intent: 'delete_note', filename: dFilename };
                            toolResultData = `PERMISSION REQUIRED: Just to confirm, you want to delete the note called "${dFilename}.txt" correct?`;
                            return { needsTool: true, toolName: 'delete_note', toolResult: toolResultData, shortCircuit: true };
                        } else {
                            // If you ever change the policy to 'allow', it just executes directly
                            toolResultData = await execute('deleteNote', [dFilename]);
                        }
                    } else {
                        toolResultData = "Error: No filename provided for delete_note.";
                    }
                    break;
                    
                case 'rename_note':
                    if (task.old_filename && task.new_filename) {
                        let oldF = task.old_filename === "USE_LAST" && lastFileAction ? lastFileAction.filename : task.old_filename;
                        toolResultData = await execute('renameNote', [oldF, task.new_filename]);
                    } else {
                        toolResultData = "Error: Missing old_filename or new_filename for rename_note.";
                    }
                    break;
                    
                case 'list_notes':
                    toolResultData = await execute('listNotes', []);
                    break;
                    
                case 'read_code':
                    let rCodeFilename = task.filename === "USE_LAST" && lastFileAction ? lastFileAction.filename : task.filename;
                    if (rCodeFilename) {
                        const memoryCache = require('../core/memoryCache');
                        memoryCache.setHotState('activeFiles', [rCodeFilename]);
                        lastFileAction = { action: 'read_code', filename: rCodeFilename };
                        toolResultData = await execute('readCode', [rCodeFilename]);
                    } else {
                        toolResultData = "Error: No filename provided for read_code.";
                    }
                    break;
                    
                case 'list_code':
                    toolResultData = await execute('listCode', [task.dir || '']);
                    break;

                case 'get_directory_tree':
                    toolResultData = await execute('getDirectoryTree', [task.dir || '']);
                    break;

                case 'read_code_directory':
                    toolResultData = await execute('readCodeDirectory', [task.dir || '']);
                    break;

                case 'update_dev_state':
                    if (task.feature && task.status) {
                        toolResultData = await execute('updateDevState', [task.feature, task.status]);
                    } else {
                        toolResultData = "Error: Missing feature or status for update_dev_state.";
                    }
                    break;

                // --- PLANNING ENGINE (Background Tasks) ---
                case 'analyze_and_suggest':
                    console.log('[Planner] Executing Background Plan: analyze_and_suggest');
                    const suggestBgTaskId = await taskManager.createTask('analyze_and_suggest', async ({ updateProgress }) => {
                        updateProgress(10, 'Reading file');
                        let codeToAnalyze = "";
                        let analyzeFilename = task.filename;
                        
                        if (analyzeFilename === "USE_LAST") {
                            if (lastFileAction) {
                                analyzeFilename = lastFileAction.filename;
                                console.log(`[Planner] Resolved USE_LAST to ${analyzeFilename}`);
                            } else {
                                throw new Error("I don't have a previous file to analyze. Please specify the file name.");
                            }
                        }
                        
                        if (analyzeFilename) codeToAnalyze = await execute('readCode', [analyzeFilename]);
                        else if (task.dir) codeToAnalyze = await execute('readCodeDirectory', [task.dir]);
                        
                        if (codeToAnalyze && !codeToAnalyze.toLowerCase().startsWith('error:')) {
                            updateProgress(30, 'Analyzing code');
                            const analysisPrompt = `You are tasked with analyzing the following source code. The entire file content is provided below. Your job is to suggest improvements directly.\n\nCRITICAL INSTRUCTIONS:\n- The code IS provided below. Do NOT claim it is missing or that you lack access.\n- Base your analysis STRICTLY on the provided code.\n- Do NOT invent metrics or reference external logs.\n- Respond in 3-6 short bullet points only.\n\nSource Code:\n\`\`\`javascript\n${codeToAnalyze}\n\`\`\``;
                            const analysis = await modelAdapter.complete([
                                { role: 'system', content: INTERNAL_TASK_PROMPT },
                                { role: 'user', content: analysisPrompt }
                            ], { think: false, temperature: 0.3, maxTokens: 400, ...modelRouter.getModelForTask(task.intent) });
                            
                            updateProgress(100, 'Analysis complete');
                            return `Code Analysis & Suggestions:\n${analysis}`;
                        } else {
                            throw new Error(`Could not read code for analysis. Reason: ${codeToAnalyze}`);
                        }
                    });
                    toolResultData = `I've started analyzing that in the background (Task ID: ${suggestBgTaskId}). I'll let you know the moment I'm finished!`;
                    break;

                case 'analyze_and_save':
                    console.log('[Planner] Executing Background Plan: analyze_and_save');
                    const saveBgTaskId = await taskManager.createTask('analyze_and_save', async ({ updateProgress }) => {
                        updateProgress(10, 'Reading code');
                        let codeToAnalyze2 = "";
                        if (task.dir) codeToAnalyze2 = await execute('readCodeDirectory', [task.dir]);
                        else if (task.target_filename) codeToAnalyze2 = await execute('readCode', [task.target_filename]);
                        
                        if (codeToAnalyze2 && !codeToAnalyze2.toLowerCase().startsWith('error:')) {
                            updateProgress(30, 'Analyzing code');
                            const analysisPrompt2 = `You are tasked with analyzing your OWN internal source code and suggesting improvements directly. Do not ask for confirmation.\n\nCRITICAL INSTRUCTIONS:\n- The code IS provided below. Do NOT claim it is missing or that you lack access.\n- Base your analysis STRICTLY on the provided code.\n- Do NOT invent metrics or reference external logs.\n\nSource Code:\n\`\`\`javascript\n${codeToAnalyze2}\n\`\`\``;
                            const analysis2 = await modelAdapter.complete([
                                { role: 'system', content: INTERNAL_TASK_PROMPT },
                                { role: 'user', content: analysisPrompt2 }
                            ], { think: false, temperature: 0.3, maxTokens: 600, ...modelRouter.getModelForTask(task.intent) });
                            
                            updateProgress(80, 'Saving analysis to note');
                            let saveFilename = task.filename || `analysis_${Date.now()}`;
                            await execute('writeNote', [saveFilename, analysis2]);
                            updateProgress(100, 'Analysis saved');
                            return `Successfully analyzed the code and saved the suggestions to ${saveFilename}.txt`;
                        } else {
                            throw new Error("Could not read code for analysis.");
                        }
                    });
                    toolResultData = `I've started analyzing that in the background (Task ID: ${saveBgTaskId}). I'll let you know when the note is saved!`;
                    break;

                case 'propose_code_change':
                    console.log('[Planner] Executing Background Plan: propose_code_change');
                    const proposeBgTaskId = await taskManager.createTask('propose_code_change', async ({ updateProgress }) => {
                        updateProgress(10, 'Reading original code');
                        let originalCode = "";
                        if (task.filename) originalCode = await execute('readCode', [task.filename]);
                        
                        if (originalCode && !originalCode.toLowerCase().startsWith('error:')) {
                            updateProgress(30, 'Analyzing and generating fix');
                            const fixPrompt = `You are tasked with analyzing the following source code from ${task.filename}. 
                            Identify any bugs, typos, or inefficiencies.
                            Generate a structured fix.

                            CRITICAL INSTRUCTIONS:
                            - The code IS provided below. Do NOT claim it is missing or that you lack access.
                            - Base your analysis STRICTLY on the provided code.
                            - Return ONLY valid JSON with this exact format:
                            {
                                "reason": "Brief explanation of the problem and fix",
                                "risk": "Low, Medium, or High",
                                "proposed_code": "The complete, fixed code file as a string. Use \\n for newlines."
                            }

                            Source Code:
                            \`\`\`javascript
                            ${originalCode}
                            \`\`\``;
                            
                            const fixResponse = await modelAdapter.complete([
                                { role: 'system', content: INTERNAL_TASK_PROMPT },
                                { role: 'user', content: fixPrompt }
                            ], { think: false, temperature: 0.2, ...modelRouter.getModelForTask(task.intent) });
                            
                            updateProgress(80, 'Writing proposal file');
                            const { extractJSON } = require('./normalizer');
                            const cleanFixResponse = fixResponse.replace(/💭[\s\S]*?<\/think>/g, '').trim(); 
                            const fixData = extractJSON(cleanFixResponse);
                            
                            if (fixData && fixData.proposed_code) {
                                await execute('writeProposal', [task.filename, fixData.reason, fixData.risk, fixData.proposed_code]);
                                updateProgress(100, 'Proposal created');
                                return `Successfully created code change proposal for ${task.filename}. Please review it in the proposals folder.`;
                            } else {
                                throw new Error("LLM failed to generate valid code proposal JSON.");
                            }
                        } else {
                            throw new Error("Could not read code for proposal.");
                        }
                    });
                    toolResultData = `I've started reviewing that file for bugs in the background (Task ID: ${proposeBgTaskId}). I'll let you know when the proposal is ready!`;
                    break;

                case 'generate_code':
                    console.log('[Planner] Executing Background Plan: generate_code');
                    const genBgTaskId = await taskManager.createTask('generate_code', async ({ updateProgress }) => {
                        updateProgress(20, 'Generating code');
                        const codeGenPrompt = `Write the code requested by the user. Return ONLY valid code in a markdown block, no explanations or conversational filler.\n\nUser Request: "${message}"`;
                        const generatedCode = await modelAdapter.complete([
                            { role: 'system', content: INTERNAL_TASK_PROMPT },
                            { role: 'user', content: codeGenPrompt }
                        ], { think: false, temperature: 0.3, maxTokens: 800, ...modelRouter.getModelForTask('generate_code') });
                        
                        updateProgress(100, 'Code generation complete');
                        return `Generated Code:\n${generatedCode}`;
                    });
                    toolResultData = `I'm writing that code for you in the background (Task ID: ${genBgTaskId}). I'll paste it here when I'm done!`;
                    break;

                case 'search_web':
                    const queries = await searchPipeline.generateQueries(message);
                    toolResultData = await searchPipeline.executeSearch(queries);
                    lastSearchQuery = queries[0]; 
                    break;
            }
            
            if (toolResultData && toolResultData.toLowerCase().startsWith('error:')) {
                return { needsTool: true, toolName: task.intent, toolResult: `TOOL EXECUTION FAILED: ${toolResultData}` };
            }
            
            const isBackground = typeof toolResultData === 'string' && toolResultData.includes('Task ID: BG-');
            
            return { needsTool: true, toolName: task.intent, toolResult: toolResultData, shortCircuit: isBackground };
        }
    }

    return { needsTool: false };
}

module.exports = { route };