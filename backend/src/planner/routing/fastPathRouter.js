// backend/src/planner/routing/fastPathRouter.js
const { execute } = require('../../tools/toolExecutor');
const state = require('../state');

async function route(intent, message, history) {
    const lowerMessage = message.toLowerCase();

    // 1. Fast Path: Follow-up Search & Confirmations
    const isAffirmative = /\b(yes|yeah|yep|sure|do it|can you do so|please do|go ahead|check it|check for that)\b/i.test(lowerMessage.trim());
    const isNegative = /\b(no|nope|cancel|stop|don't|do not)\b/i.test(lowerMessage.trim());

    if (isAffirmative && state.pendingAction) {
        console.log(`[Planner] User approved pending action: ${state.pendingAction.intent}`);
        let replyText = "";
        if (state.pendingAction.intent === 'delete_note') {
            const result = await execute('deleteNote', [state.pendingAction.filename], { isApproved: true });
            const success = !result.toLowerCase().startsWith('error:');
            replyText = success ? `Ok, I've deleted the file named ${state.pendingAction.filename}.txt.` : `I tried to delete it, but ran into an issue: ${result}`;
        }
        state.pendingAction = null; 
        return { needsTool: true, toolName: 'confirmation', toolResult: replyText, shortCircuit: true };
    }
    
    if (isNegative && state.pendingAction) {
        console.log(`[Planner] User denied pending action: ${state.pendingAction.intent}`);
        const deniedFilename = state.pendingAction.filename;
        const deniedIntent = state.pendingAction.intent;
        state.pendingAction = null; 
        let replyText = `Ok, I won't ${deniedIntent.replace('_', ' ')} the ${deniedFilename}.txt file.`;
        return { needsTool: true, toolName: 'confirmation', toolResult: replyText, shortCircuit: true };
    }

    if (isAffirmative && state.lastSearchQuery) {
        console.log(`[Planner] Executing Follow-up Web Search for: "${state.lastSearchQuery}"`);
        const searchResult = await execute('webSearch', [state.lastSearchQuery]);
        return { needsTool: true, toolName: 'webSearch', toolResult: searchResult };
    }

    // 2. Fast Path: Time/Date & Calculator
    if (/\b(convert time|timezone|jst|est|pst|gmt|what time|what date|current time|current date|what day|tell me the time|what year|current year)\b/.test(lowerMessage)) {
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

    // 3. Phase 5 Fast Paths (Files, Dev, Tasks, Utilities, Writing)
    if (lowerMessage.includes('search code for') || lowerMessage.includes('find in code') || lowerMessage.includes('grep') || lowerMessage.includes('do we use') || lowerMessage.includes('any references to') || (lowerMessage.includes('where is') && lowerMessage.includes('used'))) {
        const queryMatch = message.match(/(?:search code for|find in code|grep|do we use|any references to|where is)\s+(.*?)(?:\s+anywhere|\s+in the code|\s+in the|\?|$)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Search Code tool (Fast Path)');
            return { needsTool: true, toolName: 'searchCode', toolResult: await execute('searchCode', [queryMatch[1].trim()]) };
        }
    }

    if (lowerMessage.startsWith('find') || lowerMessage.startsWith('where is') || lowerMessage.startsWith('locate')) {
        const queryMatch = message.match(/(?:find|where is|locate)\s+(?:me\s+|the\s+|your\s+)?(.+?)(?:\s+(?:file|module|script))?(?:\?|$)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Find File tool (Fast Path)');
            return { needsTool: true, toolName: 'findFile', toolResult: await execute('findFile', [queryMatch[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('hash of') || lowerMessage.startsWith('file hash')) {
        const queryMatch = message.match(/(?:hash of|file hash)\s+(.*)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Get File Hash tool (Fast Path)');
            return { needsTool: true, toolName: 'getFileHash', toolResult: await execute('getFileHash', [queryMatch[1].trim()]) };
        }
    }

    if (lowerMessage.includes('what files changed') || lowerMessage.includes('changed files') || lowerMessage.includes('modified files') || lowerMessage.includes('have i modified')) {
        console.log('[Planner] Executing Get Changed Files tool (Fast Path)');
        return { needsTool: true, toolName: 'getChangedFiles', toolResult: await execute('getChangedFiles', []) };
    }

    if (lowerMessage.startsWith('check syntax') || lowerMessage.startsWith('validate') || (lowerMessage.includes('is') && lowerMessage.includes('valid'))) {
        const queryMatch = message.match(/(?:check syntax|validate|is)\s+(.*?)(?:\s+valid|\?|$)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Check Syntax tool (Fast Path)');
            return { needsTool: true, toolName: 'checkSyntax', toolResult: await execute('checkSyntax', [queryMatch[1].trim()]) };
        }
    }

    if (lowerMessage.startsWith('task progress') || lowerMessage.startsWith('status of task')) {
        const queryMatch = message.match(/(?:task progress|status of task)\s+(.*)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Get Task Progress tool (Fast Path)');
            return { needsTool: true, toolName: 'getTaskProgress', toolResult: await execute('getTaskProgress', [queryMatch[1].trim()]) };
        }
    }

    if (lowerMessage.includes('list active tasks') || lowerMessage.includes('running tasks') || lowerMessage.includes('background tasks') || lowerMessage.includes('working on anything')) {
        console.log('[Planner] Executing List Active Tasks tool (Fast Path)');
        return { needsTool: true, toolName: 'listActiveTasks', toolResult: await execute('listActiveTasks', []) };
    }

    if (lowerMessage.includes('validate json') || lowerMessage.includes('valid json')) {
        const queryMatch = message.match(/(?:validate json|is this valid json)\s+(.*)/i);
        if (queryMatch) {
            console.log('[Planner] Executing Validate JSON tool (Fast Path)');
            return { needsTool: true, toolName: 'validateJSON', toolResult: await execute('validateJSON', [queryMatch[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.includes('exist')) {
        const queryMatch = message.match(/(?:does|if|is)\s+(?:the\s+|your\s+)?(.+?)(?:\s+(?:file|module|script))?\s+exist/i);
        if (queryMatch) {
            console.log('[Planner] Executing File Exists tool (Fast Path)');
            return { needsTool: true, toolName: 'fileExists', toolResult: await execute('fileExists', [queryMatch[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.includes('metadata') || lowerMessage.includes('meta data') || lowerMessage.includes('file info')) {
        const queryMatch = message.match(/(?:metadata|meta\s+data|file info|info)\s+(?:for|on)\s+(?:both of those|both your|both)?\s*(?:the\s+|your\s+)?(.+?)(?:\s+(?:file|module|script))?(?:\s+and.*)?(?:\?|$)/i);
        if (queryMatch) {
            let target = queryMatch[1].trim();
            if (!target || target.toLowerCase() === 'that' || target.toLowerCase() === 'it') target = 'USE_LAST';
            console.log('[Planner] Executing Get File Metadata tool (Fast Path)');
            return { needsTool: true, toolName: 'getFileMetadata', toolResult: await execute('getFileMetadata', [target]), shortCircuit: true };
        }
    }

    if (lowerMessage.includes('run tests') || lowerMessage.includes('run the test suite') || lowerMessage.includes('npm test')) {
        console.log('[Planner] Executing Run Tests tool (Fast Path)');
        return { needsTool: true, toolName: 'runTests', toolResult: await execute('runTests', []), shortCircuit: true };
    }

    if ((lowerMessage.startsWith('convert') || lowerMessage.startsWith('how many')) && lowerMessage.includes(' to ')) {
        const match = message.match(/(?:convert|how many)\s+(\d+\.?\d*)\s+(\w+)\s+(?:to|in|is)\s+(\w+)/i);
        if (match) {
            console.log('[Planner] Executing Convert Unit tool (Fast Path)');
            return { needsTool: true, toolName: 'convertUnit', toolResult: await execute('convertUnit', [match[1], match[2], match[3]]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('convert') && (lowerMessage.includes('usd') || lowerMessage.includes('dollars') || lowerMessage.includes('eur') || lowerMessage.includes('jpy') || lowerMessage.includes('yen') || lowerMessage.includes('gbp') || lowerMessage.includes('pound'))) {
        const match = message.match(/convert\s+(\d+\.?\d*)\s+([a-z]{3})\s+to\s+([a-z]{3})/i);
        if (match) {
            console.log('[Planner] Executing Convert Currency tool (Fast Path)');
            return { needsTool: true, toolName: 'convertCurrency', toolResult: await execute('convertCurrency', [match[1], match[2], match[3]]), shortCircuit: true };
        }
    }

    if (lowerMessage.includes('percent of') || lowerMessage.includes('percentage of') || lowerMessage.includes('% of')) {
        const match = message.match(/(\d+\.?\d*)\s+(?:percent|percentage|%)\s+of\s+(\d+\.?\d*)/i);
        if (match) {
            console.log('[Planner] Executing Percentage tool (Fast Path)');
            return { needsTool: true, toolName: 'percentage', toolResult: await execute('percentage', [match[1], match[2]]), shortCircuit: true };
        }
    }

    if (lowerMessage.includes('average of') || lowerMessage.includes('mean of') || lowerMessage.includes('statistics for') || lowerMessage.includes('median of')) {
        const match = message.match(/(?:average of|mean of|statistics for|median of)\s+(.*)/i);
        if (match) {
            console.log('[Planner] Executing Statistics tool (Fast Path)');
            return { needsTool: true, toolName: 'statistics', toolResult: await execute('statistics', [match[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('word count') || lowerMessage.startsWith('how many words in')) {
        const match = message.match(/(?:word count of|how many words in)\s+(.*)/i);
        if (match) {
            console.log('[Planner] Executing Word Count tool (Fast Path)');
            return { needsTool: true, toolName: 'wordCount', toolResult: await execute('wordCount', [match[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('character count') || lowerMessage.startsWith('how many characters in')) {
        const match = message.match(/(?:character count of|how many characters in)\s+(.*)/i);
        if (match) {
            console.log('[Planner] Executing Character Count tool (Fast Path)');
            return { needsTool: true, toolName: 'characterCount', toolResult: await execute('characterCount', [match[1].trim()]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('format') && (lowerMessage.includes('uppercase') || lowerMessage.includes('lowercase') || lowerMessage.includes('titlecase'))) {
        const match = message.match(/format\s+(?:this\s+)?(?:to\s+)?(uppercase|lowercase|titlecase|capitalize|trim):\s+(.*)/i);
        if (match) {
            console.log('[Planner] Executing Format Text tool (Fast Path)');
            return { needsTool: true, toolName: 'formatText', toolResult: await execute('formatText', [match[2].trim(), match[1]]), shortCircuit: true };
        }
    }

    if (lowerMessage.startsWith('extract keywords') || lowerMessage.startsWith('keywords for')) {
        const match = message.match(/(?:extract keywords from|keywords for)\s+(.*)/i);
        if (match) {
            console.log('[Planner] Executing Extract Keywords tool (Fast Path)');
            return { needsTool: true, toolName: 'extractKeywords', toolResult: await execute('extractKeywords', [match[1].trim()]), shortCircuit: true };
        }
    }

    // 4. Fast Path: ONLY Exact File Extensions or Exact "List Notes"
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

    // Return null if no fast path matched
    return null;
}

module.exports = { route };