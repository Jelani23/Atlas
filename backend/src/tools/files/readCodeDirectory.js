// src/tools/files/readCodeDirectory.js
const projectCache = require('../../core/projectCache');

async function readCodeDirectory(dirName = '') {
    try {
        let safeDir = dirName.trim();
        
        if (safeDir === 'source' || safeDir === 'source folder' || safeDir === 'src') {
            safeDir = 'src';
        } else if (safeDir === 'root' || safeDir === 'project root' || safeDir === '.' || safeDir === 'current directory' || safeDir === '') {
            safeDir = '';
        } else if (!safeDir.startsWith('src/')) {
            safeDir = `src/${safeDir}`;
        }

        const prefix = safeDir ? `${safeDir}/` : '';
        const tree = projectCache.getTree();
        
        let result = '';
        for (const filePath of tree) {
            if (filePath.startsWith(prefix)) {
                let content = projectCache.getFile(filePath);
                if (content) {
                    content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    result += `\n=== FILE: ${filePath} ===\n${content}\n`;
                }
            }
        }
        return result || `No code files found in directory ${prefix || 'root'}.`;
    } catch (error) {
        return `Error reading directory: ${error.message}`;
    }
}

module.exports = {
    execute: readCodeDirectory,
    intentSchema: {
        name: 'readCodeDirectory',
        domain: 'FILES',
        triggers: ['read code directory', 'read directory', 'read source folder', 'read folder', 'read the code directory for', 'read me the code directory for', 'read me the code directory'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:read code directory for|read directory for|read source folder|read folder|read the code directory for|read me the code directory for|read me the code directory)\s+(.*)/i);
            let dir = m ? m[1].replace(/[?.!]+$/, '').trim() : '';
            return [dir];
        }
    }
};