// backend/src/planner/normalizer.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const projectCache = require('../core/projectCache');
const memoryCache = require('../core/memoryCache');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const getTemplates = async () => [];
const modelAdapter = createModelAdapter();

async function normalizeTask(message, history = []) {
    const fastPath = fastRegexNormalizer(message);
    if (fastPath && fastPath.intent !== 'none') {
        console.log("[Normalizer] Fast Path triggered (bypassing LLM):", fastPath.intent);
        return fastPath;
    }

    const recentHistory = history.slice(-5).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    const templates = await getTemplates();
    let templateString = templates.map(t => {
        const slots = t.required_slots && t.required_slots.length > 0 ? t.required_slots.join(', ') : 'None';
        return `- ${t.intent}: ${t.description}. Needs: ${slots}`;
    }).join('\n');

    const srcTree = projectCache.getTree();
    const hotState = memoryCache.getHotState();
    const activeFilesStr = hotState.activeFiles.length > 0 ? hotState.activeFiles.join(', ') : 'None';

    // OPTIMIZATION: Rewritten prompt to enforce extraction over evaluation
    const prompt = `Conversation History:
 ${recentHistory || 'None'}

Current User Message: "${message}"

CRITICAL INSTRUCTIONS:
1. STRICT EXTRACTION: Your job is ONLY to extract the intent and parameters. Do NOT evaluate if the file exists or assign a confidence score. Assume the target exists.
2. CONTEXT INHERITANCE: If user says "do the same", "analyze it", or uses pronouns, check History and Active Files to inherit the ACTION and TARGET.
3. STT/FUZZY MATCHING: Convert conversational file references to exact filenames. For source code, use exact paths from the Available Source Files list. For notes, convert spaces to underscores (e.g., "test note" -> "test_note").
4. NO HALLUCINATIONS: If the user asks for a note, just extract the name. Do not look for it in the Source Files list.

Active Files (HOT memory):
 ${activeFilesStr}

Available Source Files:
 ${srcTree.join('\n')}

Intent Templates:
 ${templateString}

Additional Available Tools (use if requested):
- findFile: Finds a file by name. Params: query (string)
- searchCode: Searches code for a string. Params: query (string)
- getFileHash: Gets MD5 hash of a file. Params: filename (string)
- getChangedFiles: Lists modified files. Params: none
- checkSyntax: Validates JS syntax. Params: filename (string)
- getTaskProgress: Gets status of a background task. Params: taskId (string)
- listActiveTasks: Lists running background tasks. Params: none
- validateJSON: Validates a JSON string. Params: jsonString (string)
- fileExists: Checks if a file exists. Params: filePath (string)
- getFileMetadata: Gets file size, mtime, hash. Params: filePath (string)
- convertUnit: Converts units (e.g., 5 mb to gb). Params: value, fromUnit, toUnit
- convertCurrency: Converts currency (e.g., 5 usd to eur). Params: amount, fromCurrency, toCurrency
- percentage: Calculates percentage (e.g., 15 is what percent of 90). Params: value, total
- statistics: Calculates mean, median, mode, etc. Params: dataString (e.g., "1, 2, 3")
- wordCount: Counts words in text. Params: text
- characterCount: Counts characters in text. Params: text
- formatText: Formats text to uppercase, lowercase, titlecase, etc. Params: text, format
- extractKeywords: Extracts top keywords from text. Params: text, count (optional)

Return ONLY a flat JSON object with "intent" and its parameters.
Example: {"intent": "read_code", "filename": "src/intent/intentAnalyzer.js"}
Example: {"intent": "delete_note", "filename": "test_note"}
Example: {"intent": "searchCode", "query": "TaskManager"}`;

    try {
        const response = await modelAdapter.complete([
            { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { think: false, temperature: 0.1, ...modelRouter.getDefaultModel() });
        
        const cleanResponse = response.replace(/💭[\s\S]*?<\/think>/g, '').trim();
        const parsed = extractJSON(cleanResponse);
        if (!parsed) {
            console.log("[Normalizer] Raw response (failed to parse):", safePreview(cleanResponse));
        }
        console.log("[Normalizer] LLM Output:", parsed);
        return parsed || { intent: "none" };
    } catch (e) {
        console.error("[Normalizer] LLM failed:", e.message);
        return { intent: "none" };
    }
}

async function extractSmartNoteParams(message) {
    const prompt = `You are a note-taking assistant. Instruction: "${message}"
Task 1: Determine the exact text/content to save.
Task 2: Generate a snake_case filename (2-4 words).
Return ONLY valid JSON: {"filename": "snake_case_name", "content": "the text to save"}`;
    
    try {
        const response = await modelAdapter.complete([
            { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { think: false, temperature: 0.3, ...modelRouter.getDefaultModel() });
        
        const cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        const parsed = extractJSON(cleanResponse);
        return parsed || { filename: null, content: message };
    } catch (e) {
        return { filename: null, content: message };
    }
}

function fastRegexNormalizer(message) {
    const lowerMessage = message.toLowerCase();
    const hasNoteTarget = /\bnotes?\b/.test(lowerMessage) || /\.(?:txt|md)\b/.test(lowerMessage);

    // NEW: Fast Path for analyze_and_suggest
    if (lowerMessage.includes('analyze') && (lowerMessage.includes('suggest') || lowerMessage.includes('improvements') || lowerMessage.includes('review'))) {
        // Check for explicit filenames first
        const fileMatch = message.match(/([\w\/]+\.\w+)/i);
        if (fileMatch) return { intent: 'analyze_and_suggest', filename: fileMatch[1] };
        
        // Check for conversational references
        if (lowerMessage.includes('memory cache')) return { intent: 'analyze_and_suggest', filename: 'memoryCache.js' };
        if (lowerMessage.includes('planner')) return { intent: 'analyze_and_suggest', filename: 'planner.js' };
        if (lowerMessage.includes('context manager')) return { intent: 'analyze_and_suggest', filename: 'contextManager.js' };
    }

    if (lowerMessage.includes('add a new feature') || lowerMessage.includes('add a feature') || (lowerMessage.includes('mark') && lowerMessage.includes('as'))) {
        const featureMatch = message.match(/(?:add a new feature called|add a feature called|mark the|mark)\s+(.+?)\s+(?:as|and mark it as)/i);
        if (featureMatch) {
            const statusMatch = message.match(/(?:as|mark it as)\s+(implemented|planned|in progress|in_progress)/i);
            let status = statusMatch ? statusMatch[1].toLowerCase().replace('_', ' ') : 'implemented';
            return { intent: 'update_dev_state', feature: featureMatch[1].trim(), status: status };
        }
    }

    if (hasNoteTarget && lowerMessage.includes('rename')) {
        const m = message.match(/(?:rename)\s+(?:the\s+)?(.+?)\s+(?:to|as)\s+(?:be\s+)?(.+?)(?:\s+instead|\?|$)/i);
        if (m) return { intent: 'rename_note', old_filename: m[1].trim(), new_filename: m[2].trim() };
    }

    if (hasNoteTarget && (lowerMessage.includes('delete') || lowerMessage.includes('remove'))) {
        const m = message.match(/(?:called|named)\s+(?:the\s+)?(?:file\s+|note\s+)?(.+?)(?:\?|$)/i);
        return { intent: 'delete_note', filename: m ? m[1].trim() : 'USE_LAST' };
    }

    if (lowerMessage.includes('note') && (lowerMessage.includes('read') || lowerMessage.includes('open') || lowerMessage.includes('show') || lowerMessage.includes('contents of'))) {
        const m = message.match(/(?:named|called|note|file|contents of)\s+(.+?)(?:\?|$)/i);
        return { intent: 'read_note', filename: m ? m[1].trim() : 'USE_LAST' };
    }

    const noteFollowUp = /^(?:add|append)\s+(?:another\s+)?(?:line|this|that)\b/.test(lowerMessage);
    if ((hasNoteTarget || noteFollowUp) &&
        (lowerMessage.includes('update') || lowerMessage.includes('edit') || lowerMessage.includes('append') || lowerMessage.includes('add') || lowerMessage.includes('include'))) {
        const fileMatch = message.match(/(?:named|called|note|file|into|to)\s+(.+?)(?:\s+saying|\s+with|\s+that\s+says|\?|$)/i);
        const contentMatch = message.match(/(?:saying|with|that says|to say|to add|to include|add another line saying|add a line saying)\s+(.*)/i);
        let filename = fileMatch ? fileMatch[1].trim() : 'USE_LAST';
        filename = filename.replace(/^(be|to|into|the|a|an)\s+/i, '');
        return { intent: 'append_note', filename: filename, content: contentMatch ? contentMatch[1].trim() : message };
    }

    if (lowerMessage.includes('propose a change') || lowerMessage.includes('write a proposal') || lowerMessage.includes('fix the code') || lowerMessage.includes('review and fix') || lowerMessage.includes('propose a fix')) {
        // Extract any word after "for"
        const m = message.match(/(?:proposal for|propose a change for|propose a fix for|fix the code for|review and fix for|fix the)\s+(?:the\s+)?(.+?)(?:\s+file|\?|$)/i);
        let filename = m ? m[1].trim() : null;
        
        // If we found a filename, return the intent immediately so it doesn't fall through
        if (filename) return { intent: 'propose_code_change', filename: filename };
    }


        if (
            lowerMessage.includes('take a note') ||
            lowerMessage.includes('take note') ||
            lowerMessage.includes('jot down') ||
            lowerMessage.includes('write down') ||
            lowerMessage.includes('save a note') ||
            lowerMessage.includes('save note') ||
            lowerMessage.includes('create a note')
        ) {
        const fileMatch = message.match(/(?:named|called|note|file)\s+(.+?)(?:\s+saying|\s+with|\s+that\s\says|\?|$)/i);
        const contentMatch = message.match(/(?:saying|with|that says|to say|to add|to include|add in|include|add another line saying|add a line saying)\s+(.*)/i);
        return { intent: 'create_note', filename: fileMatch ? fileMatch[1].trim() : null, content: contentMatch ? contentMatch[1].trim() : message };
    }

    if (lowerMessage.includes('source files') || lowerMessage.includes('source code') || lowerMessage.includes('list code')) return { intent: 'list_code', dir: 'src' };
    if (lowerMessage.includes('project structure') || lowerMessage.includes('full directory') || lowerMessage.includes('project folder')) return { intent: 'list_code', dir: '' };
    
    if (lowerMessage.includes('read') || lowerMessage.includes('look at') || lowerMessage.includes('open') || lowerMessage.includes('inspect') || lowerMessage.includes('contents in')) {
        const fileMatches = message.match(/([\w\/]+\.\w+)/gi);
        if (fileMatches && fileMatches.length > 0) {
            const filename = fileMatches.length === 1 ? fileMatches[0] : fileMatches;
            return { intent: 'read_code', filename: filename };
        }
    }

    // Only trigger web search for explicit web queries to stop hijacking "find file"
    if (lowerMessage.startsWith('search web for') || lowerMessage.startsWith('look up online') || lowerMessage.startsWith('google') || lowerMessage.startsWith('search the web')) {
        return { intent: 'search_web' };
    }

    return { intent: "none" };
}

module.exports = { normalizeTask, extractSmartNoteParams, fastRegexNormalizer, extractJSON };
