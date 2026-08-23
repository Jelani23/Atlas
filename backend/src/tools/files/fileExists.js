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
        // Phase: 'exist' and 'does the' alone are extremely generic
        // conversational fragments ("does the update fix the bug?", "that
        // doesn't exist anymore") with no requiredEntities backstop, and the
        // extraction regex below was permissive enough to grab whatever
        // followed as a "filename" - so these fired fileExists on ordinary
        // conversation. Requiring "file exist(s)" keeps legitimate phrasing
        // ("does the planner file exist", "does config.json file exist")
        // working while dropping the bare fragments that matched anything.
        triggers: ['file exist', 'file exists', 'does the file exist', 'does this file exist'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // 1. Try to get a strict FILE entity first
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;

            // 2. If no strict entity, extract the raw word after the trigger phrase
            if (!filename) {
                const m = message.match(/(?:hash of|metadata for|meta data for|file info for|does the|does this|file exist(?:s)?|for)\s+(?:the\s+)?(.+?)(?:\s+file\s+exist|\s+file|\?|$)/i);
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
