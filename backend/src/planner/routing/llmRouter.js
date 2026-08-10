// backend/src/planner/routing/llmRouter.js
const { execute } = require('../../tools/toolExecutor');
const { extractSmartNoteParams, fastRegexNormalizer } = require('../normalizer');
const searchPipeline = require('../searchPipeline');
const permissionManager = require('../../permissions/permissionManager');
const backgroundRouter = require('./backgroundRouter'); // ADD THIS IMPORT
const state = require('../state');

async function route(intent, message, history) {
    console.log('[Planner] Attempting Fast Regex Normalization (Bypassing LLM Normalizer)...');
    
    // 1. Try Fast Regex First
    let task = fastRegexNormalizer(message);
    
    // 2. If Fast Regex fails, we don't use the LLM to normalize. We just treat it as conversation.
    if (!task || !task.intent || task.intent === 'none') {
        console.log('[Planner] Fast Regex failed. Falling back to Main LLM Conversation.');
        return null; 
    }

    console.log(`[Planner] Fast Regex caught intent: ${task.intent}`);
    
    // 3. Check if it's a Background Task FIRST (Phase 8E)
    const bgResult = await backgroundRouter.handleTask(task, message);
    if (bgResult) {
        // Return the instant "I'm working on it" message to the UI
        return { needsTool: true, toolName: task.intent, toolResult: bgResult, shortCircuit: true };
    }

    // 4. Handle direct tool execution (Foreground)
    let toolResultData;
    switch(task.intent) {
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

        case 'search_web':
            const queries = await searchPipeline.generateQueries(message);
            toolResultData = await searchPipeline.executeSearch(queries);
            state.lastSearchQuery = queries[0]; 
            break;
    }
    
    if (toolResultData && toolResultData.toLowerCase().startsWith('error:')) {
        return { needsTool: true, toolName: task.intent, toolResult: `TOOL EXECUTION FAILED: ${toolResultData}` };
    }
    
    if (toolResultData) {
        return { needsTool: true, toolName: task.intent, toolResult: toolResultData };
    }

    return null;
}

module.exports = { route };