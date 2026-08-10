// backend/scripts/autoMigrateTools.js
const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '../src/tools');

// Heuristic mapping based on filename
const schemaMap = {
    // Files
    findFile: { domain: 'FILES', triggers: ['find', 'locate', 'where is'], requiredEntities: ['FILE'] },
    searchCode: { domain: 'FILES', triggers: ['search code', 'grep', 'references to'], requiredEntities: [] },
    readCode: { domain: 'FILES', triggers: ['read', 'open', 'inspect', 'show'], requiredEntities: ['FILE'] },
    listCode: { domain: 'FILES', triggers: ['list code', 'source files', 'project structure'], requiredEntities: [] },
    checkSyntax: { domain: 'FILES', triggers: ['check syntax', 'validate'], requiredEntities: ['FILE'] },
    getChangedFiles: { domain: 'FILES', triggers: ['changed files', 'modified files'], requiredEntities: [] },
    getFileHash: { domain: 'FILES', triggers: ['hash of', 'file hash'], requiredEntities: ['FILE'] },
    getFileMetadata: { domain: 'FILES', triggers: ['metadata', 'file info'], requiredEntities: ['FILE'] },
    fileExists: { domain: 'FILES', triggers: ['exist'], requiredEntities: ['FILE'] },
    getDirectoryTree: { domain: 'FILES', triggers: ['directory tree', 'tree view'], requiredEntities: [] },
    
    // Utilities
    calculate: { domain: 'MATH', triggers: ['calculate', 'math'], requiredEntities: ['MATH_EXPR'] },
    convertUnit: { domain: 'MATH', triggers: ['convert', 'how many'], requiredEntities: ['NUMBER', 'UNIT'] },
    convertCurrency: { domain: 'MATH', triggers: ['convert'], requiredEntities: ['NUMBER', 'UNIT'] },
    percentage: { domain: 'MATH', triggers: ['percent', '%'], requiredEntities: ['PERCENT'] },
    statistics: { domain: 'MATH', triggers: ['statistics', 'average', 'mean', 'median'], requiredEntities: ['NUMBER'] },
    wordCount: { domain: 'TEXT', triggers: ['word count', 'how many words'], requiredEntities: [] },
    characterCount: { domain: 'TEXT', triggers: ['character count', 'how many characters'], requiredEntities: [] },
    formatText: { domain: 'TEXT', triggers: ['format', 'uppercase', 'lowercase'], requiredEntities: [] },
    extractKeywords: { domain: 'TEXT', triggers: ['extract keywords', 'keywords for'], requiredEntities: [] },

    // Web
    webSearch: { domain: 'WEB', triggers: ['search web', 'look up online', 'google'], requiredEntities: [] },
    getTime: { domain: 'TIME', triggers: ['time', 'date'], requiredEntities: [] },
    convertTime: { domain: 'TIME', triggers: ['convert time', 'timezone'], requiredEntities: [] },

    // Tasks
    listActiveTasks: { domain: 'TASKS', triggers: ['active tasks', 'running tasks'], requiredEntities: [] },
    getTaskProgress: { domain: 'TASKS', triggers: ['task progress', 'status of task'], requiredEntities: ['TASK_ID'] },
    runTests: { domain: 'TASKS', triggers: ['run tests', 'npm test'], requiredEntities: [] },
    
    // Notes
    listNotes: { domain: 'NOTES', triggers: ['list notes', 'show notes'], requiredEntities: [] },
    writeNote: { domain: 'NOTES', triggers: ['take note', 'write down', 'jot down', 'save note'], requiredEntities: [] },
    readNote: { domain: 'NOTES', triggers: ['read note', 'show note'], requiredEntities: [] },
    deleteNote: { domain: 'NOTES', triggers: ['delete note', 'remove note'], requiredEntities: [] },
    appendNote: { domain: 'NOTES', triggers: ['append note', 'add to note'], requiredEntities: [] },
    renameNote: { domain: 'NOTES', triggers: ['rename note'], requiredEntities: [] },

    // Memory
    updateDevState: { domain: 'MEMORY', triggers: ['update feature', 'dev state'], requiredEntities: [] },
    searchKnowledge: { domain: 'MEMORY', triggers: ['search knowledge', 'knowledge library'], requiredEntities: [] }
};

function camelToKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function migrateTools() {
    console.log('🛠️ Starting Tool Migration...');
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
            
            // Skip if already migrated
            let content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('intentSchema')) {
                console.log(`[SKIPPED] ${category}/${file} (Already has schema)`);
                continue;
            }

            const schema = schemaMap[toolName];
            if (!schema) {
                console.log(`[MISSING] ${category}/${file} (No schema mapping found. Add it manually.)`);
                continue;
            }

            // Extract the main function name (e.g., async function findFile...)
            const funcMatch = content.match(/(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
            const funcName = funcMatch ? funcMatch[1] : toolName;

            // Generate the schema block
            const schemaStr = `{\n                name: '${toolName}',\n                domain: '${schema.domain}',\n                triggers: ${JSON.stringify(schema.triggers)},\n                requiredEntities: ${JSON.stringify(schema.requiredEntities)},\n                extractParams: (message, entities) => {\n                    // TODO: Customize parameter extraction for ${toolName}\n                    return {};\n                }\n            }`;
            
            // Replace module.exports
            const exportRegex = /module\.exports\s*=\s*([a-zA-Z0-9_]+)\s*;/;
            const exportMatch = content.match(exportRegex);

            if (exportMatch) {
                const originalExport = exportMatch[1];
                const newExport = `module.exports = {\n    execute: ${originalExport},\n    intentSchema: ${schemaStr}\n};`;
                content = content.replace(exportRegex, newExport);
                
                fs.writeFileSync(filePath, content);
                console.log(`[SUCCESS] Migrated ${category}/${file}`);
                migratedCount++;
            } else {
                console.log(`[MANUAL] ${category}/${file} (Could not auto-parse module.exports. Needs manual wrapping.)`);
            }
        }
    }

    console.log(`\n✅ Migration Complete! Successfully migrated ${migratedCount} tools.`);
    console.log('Next Step: Open the tool files and customize the `extractParams` functions to pull the right values from the message/entities.');
}

migrateTools();