// backend/scripts/migrateParams.js
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

function migrateParams() {
    console.log('🛠️ Starting Parameter Extraction Migration...');
    let migratedCount = 0;

    const categories = fs.readdirSync(toolsDir).filter(file => 
        fs.statSync(path.join(toolsDir, file)).isDirectory()
    );

    for (const category of categories) {
        const categoryDir = path.join(toolsDir, category);
        const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.js') && file !== 'index.js' && file !== '_utils.js');

        for (const file of files) {
            const toolName = file.replace('.js', '');
            const filePath = path.join(categoryDir, file);
            
            const newExtractor = paramExtractors[toolName];
            if (!newExtractor) {
                console.log(`[SKIPPED] ${category}/${file} (No extractor mapping)`);
                continue;
            }

            let content = fs.readFileSync(filePath, 'utf8');
            
            // Regex to find and replace the extractParams function
            const extractRegex = /extractParams:\s*\(message,\s*entities\)\s*=>\s*\{[\s\S]*?\}/;
            
            if (extractRegex.test(content)) {
                content = content.replace(extractRegex, newExtractor);
                fs.writeFileSync(filePath, content);
                console.log(`[SUCCESS] Migrated params for ${category}/${file}`);
                migratedCount++;
            } else {
                console.log(`[MANUAL] ${category}/${file} (Could not find extractParams to replace)`);
            }
        }
    }

    console.log(`\n✅ Migration Complete! Successfully migrated ${migratedCount} tools.`);
}

migrateParams();