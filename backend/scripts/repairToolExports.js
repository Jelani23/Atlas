// backend/scripts/repairToolExports.js
const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '../src/tools');

// Map of exact parameter extractors for each tool
const paramExtractors = {
    // Files
    findFile: `extractParams: (message, entities) => {
        const queryMatch = message.match(/(?:find|locate|where is)\\s+(?:me\\s+|the\\s+|your\\s+)?(.+?)(?:\\s+(?:file|module|script))?(?:\\?|$)/i);
        return [queryMatch ? queryMatch[1].trim() : null];
    }`,
    searchCode: `extractParams: (message, entities) => {
        const queryMatch = message.match(/(?:search code for|find in code|grep|do we use|any references to|where is)\\s+(.*?)(?:\\s+anywhere|\\s+in the code|\\s+in the|\\?|$)/i);
        return [queryMatch ? queryMatch[1].trim() : null];
    }`,
    readCode: `extractParams: (message, entities) => {
        const file = entities.find(e => e.type === 'FILE');
        return [file ? file.value : null];
    }`,
    listCode: `extractParams: (message, entities) => {
        if (message.toLowerCase().includes('source')) return ['src'];
        return [''];
    }`,
    checkSyntax: `extractParams: (message, entities) => {
        const file = entities.find(e => e.type === 'FILE');
        return [file ? file.value : null];
    }`,
    getChangedFiles: `extractParams: (message, entities) => { return []; }`,
    getFileHash: `extractParams: (message, entities) => {
        const file = entities.find(e => e.type === 'FILE');
        return [file ? file.value : null];
    }`,
    getFileMetadata: `extractParams: (message, entities) => {
        const file = entities.find(e => e.type === 'FILE');
        return [file ? file.value : null];
    }`,
    fileExists: `extractParams: (message, entities) => {
        const file = entities.find(e => e.type === 'FILE');
        return [file ? file.value : null];
    }`,
    getDirectoryTree: `extractParams: (message, entities) => { return ['']; }`,
    
    // Utilities
    calculate: `extractParams: (message, entities) => {
        const mathExpr = entities.find(e => e.type === 'MATH_EXPR');
        return [mathExpr ? mathExpr.value : null];
    }`,
    convertUnit: `extractParams: (message, entities) => {
        const num = entities.find(e => e.type === 'NUMBER');
        const fromUnit = entities.find(e => e.type === 'UNIT');
        const targetMatch = message.match(/(?:to|how many)\\s+(cm|ft|feet|centimeters|meters|gb|mb|kb|hours|minutes|seconds)/i);
        return [
            num ? num.value : null,
            fromUnit ? fromUnit.value : null,
            targetMatch ? targetMatch[1] : null
        ];
    }`,
    convertCurrency: `extractParams: (message, entities) => {
        const num = entities.find(e => e.type === 'NUMBER');
        const curr = entities.find(e => e.type === 'CURRENCY');
        const targetMatch = message.match(/to\\s+(usd|eur|jpy|gbp|dollars|yen|pounds)/i);
        return [
            num ? num.value : null,
            curr ? curr.value : null,
            targetMatch ? targetMatch[1] : null
        ];
    }`,
    percentage: `extractParams: (message, entities) => {
        const percent = entities.find(e => e.type === 'PERCENT');
        const num = entities.find(e => e.type === 'NUMBER');
        return [
            percent ? percent.value : null,
            num ? num.value : null
        ];
    }`,
    statistics: `extractParams: (message, entities) => {
        const match = message.match(/(?:average of|mean of|statistics for|median of)\\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }`,
    wordCount: `extractParams: (message, entities) => {
        const match = message.match(/(?:word count of|how many words in)\\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }`,
    characterCount: `extractParams: (message, entities) => {
        const match = message.match(/(?:character count of|how many characters in)\\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }`,
    formatText: `extractParams: (message, entities) => {
        const match = message.match(/format\\s+(?:this\\s+)?(?:to\\s+)?(uppercase|lowercase|titlecase|capitalize|trim):\\s+(.*)/i);
        return [match ? match[2].trim() : null, match ? match[1] : null];
    }`,
    extractKeywords: `extractParams: (message, entities) => {
        const match = message.match(/(?:extract keywords from|keywords for)\\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }`,

    // Web
    webSearch: `extractParams: (message, entities) => { return []; }`,
    getTime: `extractParams: (message, entities) => { return []; }`,
    convertTime: `extractParams: (message, entities) => {
        const zoneMatch = message.match(/\\b([a-zA-Z]{2,4})\\b(?=\\s*$|\\s*[\\?.!])/i) || message.match(/\\bto\\s+([a-zA-Z]{2,4})\\b/i);
        return [zoneMatch ? zoneMatch[1] : "UTC"];
    }`,

    // Tasks
    listActiveTasks: `extractParams: (message, entities) => { return []; }`,
    getTaskProgress: `extractParams: (message, entities) => {
        const taskId = entities.find(e => e.type === 'TASK_ID');
        return [taskId ? taskId.value : null];
    }`,
    runTests: `extractParams: (message, entities) => { return []; }`,
    
    // Notes
    listNotes: `extractParams: (message, entities) => { return []; }`,
    writeNote: `extractParams: (message, entities) => {
        const contentMatch = message.match(/(?:take a note|take note|jot down|write down|create a note|save a note)[:\\s]*(.*)/i);
        return [null, contentMatch ? contentMatch[1].trim() : ""];
    }`,
    readNote: `extractParams: (message, entities) => { return [null]; }`,
    deleteNote: `extractParams: (message, entities) => { return [null]; }`,
    appendNote: `extractParams: (message, entities) => { return [null, null]; }`,
    renameNote: `extractParams: (message, entities) => { return [null, null]; }`,

    // Memory
    updateDevState: `extractParams: (message, entities) => { return [null, null]; }`,
    searchKnowledge: `extractParams: (message, entities) => { return [null]; }`
};

const schemaMap = {
    findFile: { domain: 'FILES', triggers: ['find', 'locate', 'where is'], requiredEntities: [] },
    searchCode: { domain: 'FILES', triggers: ['search code', 'grep', 'references to'], requiredEntities: [] },
    readCode: { domain: 'FILES', triggers: ['read', 'open', 'inspect', 'show'], requiredEntities: ['FILE'] },
    listCode: { domain: 'FILES', triggers: ['list code', 'source files', 'project structure'], requiredEntities: [] },
    checkSyntax: { domain: 'FILES', triggers: ['check syntax', 'validate'], requiredEntities: ['FILE'] },
    getChangedFiles: { domain: 'FILES', triggers: ['changed', 'modified', 'what files'], requiredEntities: [] },
    getFileHash: { domain: 'FILES', triggers: ['hash of', 'file hash'], requiredEntities: ['FILE'] },
    getFileMetadata: { domain: 'FILES', triggers: ['metadata', 'file info'], requiredEntities: ['FILE'] },
    fileExists: { domain: 'FILES', triggers: ['exist'], requiredEntities: ['FILE'] },
    getDirectoryTree: { domain: 'FILES', triggers: ['directory tree', 'tree view'], requiredEntities: [] },
    calculate: { domain: 'MATH', triggers: ['calculate', 'math'], requiredEntities: ['MATH_EXPR'] },
    convertUnit: { domain: 'MATH', triggers: ['convert', 'how many', 'cm', 'ft', 'feet', 'centimeters', 'meters'], requiredEntities: ['NUMBER', 'UNIT'] },
    convertCurrency: { domain: 'MATH', triggers: ['convert', 'usd', 'eur', 'jpy', 'gbp', 'dollars', 'yen', 'pounds'], requiredEntities: ['NUMBER', 'CURRENCY'] },
    percentage: { domain: 'MATH', triggers: ['percent', '%'], requiredEntities: ['PERCENT'] },
    statistics: { domain: 'MATH', triggers: ['statistics', 'average', 'mean', 'median'], requiredEntities: ['NUMBER'] },
    wordCount: { domain: 'TEXT', triggers: ['word count', 'how many words'], requiredEntities: [] },
    characterCount: { domain: 'TEXT', triggers: ['character count', 'how many characters'], requiredEntities: [] },
    formatText: { domain: 'TEXT', triggers: ['format', 'uppercase', 'lowercase'], requiredEntities: [] },
    extractKeywords: { domain: 'TEXT', triggers: ['extract keywords', 'keywords for'], requiredEntities: [] },
    webSearch: { domain: 'WEB', triggers: ['search web', 'search the web', 'look up online', 'google', 'news on'], requiredEntities: [] },
    getTime: { domain: 'TIME', triggers: ['time', 'date'], requiredEntities: [] },
    convertTime: { domain: 'TIME', triggers: ['convert time', 'timezone'], requiredEntities: [] },
    listActiveTasks: { domain: 'TASKS', triggers: ['active tasks', 'running tasks'], requiredEntities: [] },
    getTaskProgress: { domain: 'TASKS', triggers: ['task progress', 'status of task', 'bg-', 'task-'], requiredEntities: ['TASK_ID'] },
    runTests: { domain: 'TASKS', triggers: ['run tests', 'npm test'], requiredEntities: [] },
    listNotes: { domain: 'NOTES', triggers: ['list', 'show', 'display'], requiredEntities: [] },
    writeNote: { domain: 'NOTES', triggers: ['take a note', 'take note', 'jot down', 'write down', 'save note', 'create a note'], requiredEntities: [] },
    readNote: { domain: 'NOTES', triggers: ['read note', 'show note'], requiredEntities: [] },
    deleteNote: { domain: 'NOTES', triggers: ['delete note', 'remove note'], requiredEntities: [] },
    appendNote: { domain: 'NOTES', triggers: ['append note', 'add to note'], requiredEntities: [] },
    renameNote: { domain: 'NOTES', triggers: ['rename note'], requiredEntities: [] },
    updateDevState: { domain: 'MEMORY', triggers: ['update feature', 'dev state'], requiredEntities: [] },
    searchKnowledge: { domain: 'MEMORY', triggers: ['search knowledge', 'knowledge library'], requiredEntities: [] }
};

function repairTools() {
    console.log('🛠️ Starting Tool Export Repair...');
    let repairedCount = 0;

    const categories = fs.readdirSync(toolsDir).filter(file => 
        fs.statSync(path.join(toolsDir, file)).isDirectory()
    );

    for (const category of categories) {
        const categoryDir = path.join(toolsDir, category);
        const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.js') && file !== 'index.js' && file !== '_utils.js');

        for (const file of files) {
            const toolName = file.replace('.js', '');
            const filePath = path.join(categoryDir, file);
            
            const schema = schemaMap[toolName];
            const extractor = paramExtractors[toolName];
            
            if (!schema || !extractor) {
                console.log(`[SKIPPED] ${category}/${file} (No mapping)`);
                continue;
            }

            let content = fs.readFileSync(filePath, 'utf8');
            
            // Extract the main function name
            const funcMatch = content.match(/(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
            const funcName = funcMatch ? funcMatch[1] : toolName;
            
            // Remove everything from "module.exports" onwards
            const exportIndex = content.indexOf('module.exports');
            if (exportIndex === -1) continue;
            
            const cleanContent = content.substring(0, exportIndex).trim();
            
            // Build the perfectly formatted export block
            const newExport = `module.exports = {
    execute: ${funcName},
    intentSchema: {
        name: '${toolName}',
        domain: '${schema.domain}',
        triggers: ${JSON.stringify(schema.triggers)},
        requiredEntities: ${JSON.stringify(schema.requiredEntities)},
        ${extractor}
    }
};`;

            const finalContent = cleanContent + '\n\n' + newExport + '\n';
            fs.writeFileSync(filePath, finalContent);
            console.log(`[REPAIRED] ${category}/${file}`);
            repairedCount++;
        }
    }

    console.log(`\n✅ Repair Complete! Successfully fixed ${repairedCount} tools.`);
}

repairTools();