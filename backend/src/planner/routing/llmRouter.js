// backend/src/planner/routing/llmRouter.js
const { execute } = require('../../tools/toolExecutor');
const { normalizeTask, extractSmartNoteParams, fastRegexNormalizer } = require('../normalizer');
const searchPipeline = require('../searchPipeline');
const permissionManager = require('../../permissions/permissionManager');
const backgroundRouter = require('./backgroundRouter');
const state = require('../state');

async function route(intent, message, history) {
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

    if (typeof task.confidence === 'number' && task.confidence < 0.4 && task.intent !== 'ask_clarification') {
        console.log(`[Planner] Confidence too low (${task.confidence}). Asking for clarification...`);
        return { needsTool: true, toolName: 'ask_clarification', toolResult: `CLARIFICATION REQUESTED: I'm not entirely sure what you mean. Could you clarify what you'd like me to do?` };
    }

    if (task.intent && task.intent !== 'none') {
        console.log(`[Planner] Executing Task: ${task.intent}`, task);
        
        // 1. Check if it's a background task first
        const bgResult = await backgroundRouter.handleTask(task, message);
        if (bgResult) {
            return { needsTool: true, toolName: task.intent, toolResult: bgResult, shortCircuit: true };
        }

        // 2. Handle direct tool execution
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
                state.lastFileAction = { action: 'write', filename: wFilename };
                toolResultData = await execute('writeNote', [wFilename, wContent]);
                break;
                
            case 'append_note':
                let aFilename = task.filename === "USE_LAST" && state.lastFileAction ? state.lastFileAction.filename : task.filename;
                let aContent = task.content || message;
                if (aFilename) {
                    state.lastFileAction = { action: 'append', filename: aFilename };
                    toolResultData = await execute('appendNote', [aFilename, aContent]);
                } else {
                    toolResultData = "Error: No filename provided for append_note.";
                }
                break;
                
            case 'read_note':
                let rFilename = task.filename === "USE_LAST" && state.lastFileAction ? state.lastFileAction.filename : task.filename;
                if (rFilename) {
                    state.lastFileAction = { action: 'read', filename: rFilename };
                    toolResultData = await execute('readNote', [rFilename]);
                } else {
                    toolResultData = "Error: No filename provided for read_note.";
                }
                break;
                
            case 'delete_note':
                let dFilename = task.filename === "USE_LAST" && state.lastFileAction ? state.lastFileAction.filename : task.filename;
                if (dFilename) {
                    const permCheck = permissionManager.check('deleteNote');
                    if (permCheck.requiresApproval) {
                        state.pendingAction = { intent: 'delete_note', filename: dFilename };
                        toolResultData = `PERMISSION REQUIRED: Just to confirm, you want to delete the note called "${dFilename}.txt" correct?`;
                        return { needsTool: true, toolName: 'delete_note', toolResult: toolResultData, shortCircuit: true };
                    } else {
                        toolResultData = await execute('deleteNote', [dFilename]);
                    }
                } else {
                    toolResultData = "Error: No filename provided for delete_note.";
                }
                break;
                
            case 'rename_note':
                if (task.old_filename && task.new_filename) {
                    let oldF = task.old_filename === "USE_LAST" && state.lastFileAction ? state.lastFileAction.filename : task.old_filename;
                    toolResultData = await execute('renameNote', [oldF, task.new_filename]);
                } else {
                    toolResultData = "Error: Missing old_filename or new_filename for rename_note.";
                }
                break;
                
            case 'list_notes':
                toolResultData = await execute('listNotes', []);
                break;
                
            case 'read_code':
                let rCodeFilename = task.filename === "USE_LAST" && state.lastFileAction ? state.lastFileAction.filename : task.filename;
                if (rCodeFilename) {
                    const memoryCache = require('../../core/memoryCache');
                    memoryCache.setHotState('activeFiles', [rCodeFilename]);
                    state.lastFileAction = { action: 'read_code', filename: rCodeFilename };
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

            case 'search_web':
                const queries = await searchPipeline.generateQueries(message);
                toolResultData = await searchPipeline.executeSearch(queries);
                state.lastSearchQuery = queries[0]; 
                break;
        }
        
        if (toolResultData && toolResultData.toLowerCase().startsWith('error:')) {
            return { needsTool: true, toolName: task.intent, toolResult: `TOOL EXECUTION FAILED: ${toolResultData}` };
        }
        
        return { needsTool: true, toolName: task.intent, toolResult: toolResultData };
    }

    return null;
}

module.exports = { route };