// src/tools/files/getFileMetadata.js
const fs = require('fs');
const path = require('path');
const projectCache = require('../../core/projectCache');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function getFileMetadata(filePath) {
    try {
        if (!filePath) return "Error: No file path provided.";
        let targetPath = filePath;
        let fullPath = path.join(BACKEND_ROOT, targetPath);
        if (!fs.existsSync(fullPath)) {
            const foundPath = projectCache.findFile(filePath);
            if (foundPath) {
                targetPath = foundPath;
                fullPath = path.join(BACKEND_ROOT, targetPath);
            } else {
                return `Error: File ${filePath} does not exist.`;
            }
        }
        const stats = fs.statSync(fullPath);
        const hash = projectCache.getFileHash(targetPath); 
        return `Metadata for ${targetPath}:\nSize: ${stats.size} bytes\nModified: ${stats.mtime.toISOString()}\nHash: ${hash || 'N/A (not in cache)'}`;
    } catch (error) {
        return `Error getting file metadata: ${error.message}`;
    }
}

module.exports = {
    execute: getFileMetadata,
    intentSchema: {
        name: 'getFileMetadata',
        domain: 'FILES',
        triggers: ['metadata', 'meta data', 'file info'],
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
