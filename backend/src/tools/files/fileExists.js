// src/tools/files/fileExists.js
const fs = require('fs');
const path = require('path');
const projectCache = require('../../core/projectCache');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function fileExists(filePath) {
    try {
        if (!filePath) return "Error: No file path provided.";
        let fullPath = path.join(BACKEND_ROOT, filePath);
        if (!fs.existsSync(fullPath)) {
            const foundPath = projectCache.findFile(filePath);
            if (foundPath) return `Yes, the file ${foundPath} exists.`;
            return `No, the file ${filePath} does not exist.`;
        }
        return `Yes, the file ${filePath} exists.`;
    } catch (error) {
        return `Error checking file existence: ${error.message}`;
    }
}

module.exports = {
    execute: fileExists,
    intentSchema: {
        name: 'fileExists',
        domain: 'FILES',
        triggers: ['exist', 'does the', 'file exist'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // 1. Try to get a strict FILE entity first
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;

            // 2. If no strict entity, extract the raw word after the trigger phrase
            if (!filename) {
                const m = message.match(/(?:hash of|metadata for|meta data for|file info for|exist|does the|file exist|for)\s+(?:the\s+)?(.+?)(?:\s+file|\?|$)/i);
                if (m) filename = m[1].trim();
            }

            // 3. Resolve the full path using the project cache
            if (filename) {
                const projectCache = require('../../core/projectCache');
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            
            return [filename];
        }
    }
};
