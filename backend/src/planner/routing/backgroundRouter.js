// backend/src/planner/routing/backgroundRouter.js
const { execute } = require('../../tools/toolExecutor');
const { createModelAdapter } = require('../../models/modelAdapter');
const modelRouter = require('../../models/modelRouter');
const taskManager = require('../../tasks/taskManager');
const state = require('../state');

const INTERNAL_TASK_PROMPT = "You are Atlas, an advanced AI companion. Execute the requested internal task directly and concisely. Provide the technical output without conversational filler or asking for permission. Your user prefers direct action over confirmation.";
const modelAdapter = createModelAdapter();

async function handleTask(task, message, parentTaskId, requestId) {
    switch(task.intent) {
        case 'analyze_and_suggest':
            console.log('[Planner] Executing Background Plan: analyze_and_suggest');
            const suggestBgTaskId = await taskManager.createTask('analyze_and_suggest', async ({ updateProgress, isCancelled }) => {
                updateProgress(10, 'Reading file');
                if (isCancelled()) throw new Error("Task cancelled before file read.");
                
                let codeToAnalyze = "";
                let analyzeFilename = task.filename;
                
                if (analyzeFilename === "USE_LAST") {
                    if (state.lastFileAction) {
                        analyzeFilename = state.lastFileAction.filename;
                    } else {
                        throw new Error("I don't have a previous file to analyze. Please specify the file name.");
                    }
                }
                
                if (analyzeFilename) codeToAnalyze = await execute('readCode', [analyzeFilename]);
                else if (task.dir) codeToAnalyze = await execute('readCodeDirectory', [task.dir]);
                
                if (codeToAnalyze && !codeToAnalyze.toLowerCase().startsWith('error:')) {
                    updateProgress(30, 'Analyzing code');
                    if (isCancelled()) throw new Error("Task cancelled before LLM analysis.");
                    
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
            }, parentTaskId, requestId, 'NORMAL');
            return `I've started analyzing that in the background (Task ID: ${suggestBgTaskId}). I'll let you know the moment I'm finished!`;

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
            }, parentTaskId, requestId, 'NORMAL');
            return `I've started analyzing that in the background (Task ID: ${saveBgTaskId}). I'll let you know when the note is saved!`;

        case 'propose_code_change':
            console.log('[Planner] Executing Background Plan: propose_code_change');
            const proposeBgTaskId = await taskManager.createTask('propose_code_change', async ({ updateProgress }) => {
                updateProgress(10, 'Reading original code');
                let originalCode = "";
                if (task.filename) originalCode = await execute('readCode', [task.filename]);
                
                if (originalCode && !originalCode.toLowerCase().startsWith('error:')) {
                    updateProgress(30, 'Analyzing and generating fix');
                    const fixPrompt = `You are an expert code reviewer analyzing the source code of "${task.filename}".
                    
                    Your job:
                    1. Identify any bugs, typos, or inefficiencies.
                    2. Provide the SPECIFIC corrected code block (not the whole file).

                    CRITICAL INSTRUCTIONS:
                    - The code IS provided below in full. Do NOT claim it is missing or incomplete.
                    - In the <code> block, output ONLY the specific function or block that contains the fix.
                    - Return your response in this exact format:
                    <reason>Brief explanation of the problem and fix</reason>
                    <risk>Low, Medium, or High</risk>
                    <code>
                    The specific corrected code block
                    </code>

                    Source Code:
                    \`\`\`javascript
                    ${originalCode}
                    \`\`\``;
                    
                    const fixResponse = await modelAdapter.complete([
                        { role: 'system', content: INTERNAL_TASK_PROMPT },
                        { role: 'user', content: fixPrompt }
                    ], { think: false, temperature: 0.2, ...modelRouter.getModelForTask(task.intent) });
                    
                    updateProgress(80, 'Writing proposal file');
                    const { stripThinking } = require('../../utils/jsonExtractor');
                    let cleanFixResponse = stripThinking(fixResponse).trim();
                    
                    const reasonMatch = cleanFixResponse.match(/<reason>([\s\S]*?)<\/reason>/i);
                    const riskMatch = cleanFixResponse.match(/<risk>([\s\S]*?)<\/risk>/i);
                    const codeMatch = cleanFixResponse.match(/<code>([\s\S]*?)<\/code>/i);
                    
                    if (codeMatch && codeMatch[1] && codeMatch[1].trim().length > 0) {
                        const reason = reasonMatch ? reasonMatch[1].trim() : "No reason provided.";
                        const risk = riskMatch ? riskMatch[1].trim() : "Unknown";
                        const code = codeMatch[1].trim();
                        
                        await execute('writeProposal', [task.filename, reason, risk, code]);
                        updateProgress(100, 'Proposal created');
                        return `Successfully created code change proposal for ${task.filename}. Please review it in the proposals folder.`;
                    } else {
                        console.warn('[ProposeCodeChange] Failed to parse XML. Saving raw response as markdown.');
                        await execute('writeProposal', [task.filename, "LLM response was not valid XML.", "Unknown", cleanFixResponse]);
                        updateProgress(100, 'Proposal created (raw)');
                        return `Created a raw proposal for ${task.filename} (XML parsing failed). Please review it in the proposals folder.`;
                    }
                } else {
                    throw new Error("Could not read code for proposal.");
                }
            }, parentTaskId, requestId, 'NORMAL');
            return `I've started reviewing that file for bugs in the background (Task ID: ${proposeBgTaskId}). I'll let you know when the proposal is ready!`;

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
            }, parentTaskId, requestId, 'NORMAL');
            return `I'm writing that code for you in the background (Task ID: ${genBgTaskId}). I'll paste it here when I'm done!`;

        default:
            return null;
    }
}

module.exports = { handleTask };