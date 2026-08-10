// src/tools/files/readCode.js
const path = require('path');
const projectCache = require('../../core/projectCache');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function readCode(filePaths) {
    try {
        const filesToRead = Array.isArray(filePaths) ? filePaths : [filePaths];
        let finalResult = '';
        for (const currentFile of filesToRead) {
            if (!currentFile) {
                finalResult += `\nError: No file path provided.\n`;
                continue;
            }
            let safePath = path.normalize(currentFile).replace(/^(\.\.(\/|\\|$))+/, '');
            let content = projectCache.getFile(safePath);
            if (!content) {
                const baseName = path.basename(safePath);
                const foundPath = projectCache.findFile(baseName);
                if (foundPath) {
                    content = projectCache.getFile(foundPath);
                    safePath = foundPath;
                } else {
                    finalResult += `\nError: File ${baseName} not found in project cache.\n`;
                    continue;
                }
            }
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const systemContext = `[SYSTEM NOTE: This code is read from Atlas's own local working directory. It is not an external project unless explicitly stated by the user.]\n`;
            finalResult += `\nContent of ${safePath}:\n\n${systemContext}${content}\n\n`;
        }
        return finalResult.trim() || "No files could be read.";
    } catch (error) {
        return `Error reading code: ${error.message}`;
    }
}

module.exports = {
    execute: readCode,
    intentSchema: {
        name: 'readCode',
        domain: 'FILES',
        triggers: ['read the code for', 'read me the code for', 'read code for', 'show the code for', 'open the code for', 'inspect the code for', 'read code', 'read me the code'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:read the code for|read me the code for|read code for|show the code for|open the code for|inspect the code for|read code|read me the code)\s+(?:the\s+)?(.+?)(?:\s+file|\?|$)/i);
            let filename = m ? m[1].trim() : null;
            if (filename) {
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            return [filename];
        }
    }
};