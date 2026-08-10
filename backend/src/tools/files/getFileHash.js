// src/tools/files/getFileHash.js
const projectCache = require('../../core/projectCache');

async function getFileHash(filePath) {
    try {
        if (!filePath) return "Error: No file path provided.";
        const hash = projectCache.getFileHash(filePath);
        return hash ? `MD5 Hash of ${filePath}: ${hash}` : `Error: Could not get hash for ${filePath}. File might not exist in cache.`;
    } catch (error) {
        return `Error getting file hash: ${error.message}`;
    }
}

module.exports = {
    execute: getFileHash,
    intentSchema: {
        name: 'getFileHash',
        domain: 'FILES',
        triggers: ['hash of', 'file hash'],
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
