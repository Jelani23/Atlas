// backend/scripts/fixToolSchemas.js
const fs = require('fs');
const path = require('path');
const toolsDir = path.join(__dirname, '../src/tools');

const schemas = {
    'web/webSearch.js': `module.exports = {
    execute: webSearch,
    intentSchema: {
        name: 'webSearch',
        domain: 'WEB',
        triggers: ['look up', 'news on', 'search web', 'search the web', 'google', 'search up'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const query = message.replace(/(search the web for|search web for|look up online|google|search up|look up|search for|search)/i, '').replace(/[?.!]+$/, '').trim();
            return [query || null];
        }
    }
};`,
    'web/convertTime.js': `module.exports = {
    execute: convertTime,
    intentSchema: {
        name: 'convertTime',
        domain: 'TIME',
        triggers: ['convert time', 'timezone', 'jst', 'est', 'pst', 'gmt', 'time in'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const zoneMatch = message.match(/\\b([a-zA-Z]{2,4})\\b(?=\\s*$|\\s*[\\?.!])/i) || message.match(/\\bto\\s+([a-zA-Z]{2,4})\\b/i) || message.match(/time in\\s+(.*)/i);
            return [zoneMatch ? zoneMatch[1] : "UTC"];
        }
    }
};`,
    'tasks/listActiveTasks.js': `module.exports = {
    execute: listActiveTasks,
    intentSchema: {
        name: 'listActiveTasks',
        domain: 'TASKS',
        triggers: ['active tasks', 'running tasks', 'background tasks', 'working on anything'],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};`,
    'tasks/runTests.js': `module.exports = {
    execute: runTests,
    intentSchema: {
        name: 'runTests',
        domain: 'TASKS',
        triggers: ['run tests', 'npm test', 'test suite', 'run the test'],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};`,
    'writing/extractKeywords.js': `module.exports = {
    execute: extractKeywords,
    intentSchema: {
        name: 'extractKeywords',
        domain: 'TEXT',
        triggers: ['extract keywords', 'keywords for', 'keywords from'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const match = message.match(/(?:extract keywords from|keywords for|extract keywords)\\s*:?\\s*(.*)/i);
            return [match ? match[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};`,
    'utilities/characterCount.js': `module.exports = {
    execute: characterCount,
    intentSchema: {
        name: 'characterCount',
        domain: 'TEXT',
        triggers: ['character count', 'how many characters', 'characters in'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const match = message.match(/(?:character count of|how many characters are in|how many characters in|characters in)\\s+(.*)/i);
            return [match ? match[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};`,
    'files/getFileHash.js': `module.exports = {
    execute: getFileHash,
    intentSchema: {
        name: 'getFileHash',
        domain: 'FILES',
        triggers: ['hash of', 'file hash'],
        requiredEntities: ['FILE'],
        extractParams: (message, entities) => {
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;
            if (filename) {
                const projectCache = require('../../core/projectCache');
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            return [filename];
        }
    }
};`,
    'files/getFileMetadata.js': `module.exports = {
    execute: getFileMetadata,
    intentSchema: {
        name: 'getFileMetadata',
        domain: 'FILES',
        triggers: ['metadata', 'meta data', 'file info'],
        requiredEntities: ['FILE'],
        extractParams: (message, entities) => {
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;
            if (filename) {
                const projectCache = require('../../core/projectCache');
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            return [filename];
        }
    }
};`,
    'files/fileExists.js': `module.exports = {
    execute: fileExists,
    intentSchema: {
        name: 'fileExists',
        domain: 'FILES',
        triggers: ['exist', 'does the', 'file exist'],
        requiredEntities: ['FILE'],
        extractParams: (message, entities) => {
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;
            if (filename) {
                const projectCache = require('../../core/projectCache');
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            return [filename];
        }
    }
};`,
    'notes/writeNote.js': `module.exports = {
    execute: writeNote,
    intentSchema: {
        name: 'writeNote',
        domain: 'NOTES',
        triggers: ['take a note', 'take note', 'jot down', 'write down', 'save note', 'create a note'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:create a note|take note|write note|save note)\\s+(?:called|named)\\s+(.*?)\\s+(?:saying|with|that says)\\s+(.*)/i);
            if (m) return [m[1].replace(/\\s+/g, '_'), m[2]];
            const contentMatch = message.match(/(?:take a note|take note|jot down|write down|create a note|save a note)[:\\s]*(.*)/i);
            return [null, contentMatch ? contentMatch[1].trim() : ""];
        }
    }
};`,
    'notes/readNote.js': `module.exports = {
    execute: readNote,
    intentSchema: {
        name: 'readNote',
        domain: 'NOTES',
        triggers: ['read note', 'show note', 'open note'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:named|called|note|file|contents of)\\s+(.+?)(?:\\?|$)/i);
            return [m ? m[1].replace(/\\s+/g, '_').trim() : 'USE_LAST'];
        }
    }
};`,
    'notes/appendNote.js': `module.exports = {
    execute: appendNote,
    intentSchema: {
        name: 'appendNote',
        domain: 'NOTES',
        triggers: ['append note', 'add to note', 'add a line to', 'add a line'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:to|in)\\s+(.*?)\\s+(?:saying|with|that says)\\s+(.*)/i) || message.match(/(?:add a line to|append to)\\s+(.*?)\\s+(?:saying|with|that says)\\s+(.*)/i);
            if (m) return [m[1].replace(/\\s+/g, '_').trim(), m[2].trim()];
            const contentMatch = message.match(/(?:saying|with|that says|to add|to include|add another line saying|add a line saying)\\s+(.*)/i);
            return ['USE_LAST', contentMatch ? contentMatch[1].trim() : message];
        }
    }
};`,
    'notes/renameNote.js': `module.exports = {
    execute: renameNote,
    intentSchema: {
        name: 'renameNote',
        domain: 'NOTES',
        triggers: ['rename note', 'rename the'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:rename)\\s+(?:the\\s+)?(.+?)\\s+(?:to|as)\\s+(?:be\\s+)?(.+?)(?:\\s+instead|\\?|$)/i);
            if (m) return [m[1].replace(/\\s+/g, '_').trim(), m[2].replace(/\\s+/g, '_').trim()];
            return ['USE_LAST', null];
        }
    }
};`,
    'notes/deleteNote.js': `module.exports = {
    execute: deleteNote,
    intentSchema: {
        name: 'deleteNote',
        domain: 'NOTES',
        triggers: ['delete note', 'remove note', 'delete the', 'remove the'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:called|named)\\s+(?:the\\s+)?(?:file\\s+|note\\s+)?(.+?)(?:\\?|$)/i);
            return [m ? m[1].replace(/\\s+/g, '_').trim() : 'USE_LAST'];
        }
    }
};`
};

function fixSchemas() {
    console.log('🛠️ Fixing Tool Schemas...');
    let count = 0;
    for (const [filePath, exportBlock] of Object.entries(schemas)) {
        const fullPath = path.join(toolsDir, filePath);
        if (!fs.existsSync(fullPath)) {
            console.log(`[MISSING] ${filePath}`);
            continue;
        }
        
        let content = fs.readFileSync(fullPath, 'utf8');
        const exportIndex = content.indexOf('module.exports');
        if (exportIndex === -1) continue;
        
        const cleanContent = content.substring(0, exportIndex).trim();
        const finalContent = cleanContent + '\n\n' + exportBlock + '\n';
        fs.writeFileSync(fullPath, finalContent);
        console.log(`[FIXED] ${filePath}`);
        count++;
    }
    console.log(`\n✅ Complete! Fixed ${count} tools.`);
}

fixSchemas();