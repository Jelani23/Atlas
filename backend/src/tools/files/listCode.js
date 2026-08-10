// src/tools/files/listCode.js
const fs = require('fs');
const path = require('path');
const { findDirectoryRecursive } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function listCode(dirName = '') {
    try {
        const basePath = BACKEND_ROOT;
        if (dirName) {
            const lowerDir = dirName.toLowerCase();
            if (lowerDir === 'source' || lowerDir === 'source folder') dirName = 'src';
            else if (lowerDir === 'root' || lowerDir === 'project root' || lowerDir === '.' || lowerDir === 'current directory') dirName = '';
        }
        let targetPath = path.join(basePath, dirName);
        if (dirName && !fs.existsSync(targetPath)) {
            const foundDir = findDirectoryRecursive(basePath, dirName);
            if (foundDir) targetPath = foundDir;
            else return `Error: Directory ${dirName} not found anywhere in the project.`;
        }
        if (!targetPath.startsWith(basePath)) return "Error: Cannot read outside project directory.";
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
        return `Contents of ${path.relative(basePath, targetPath) || 'project root'}:\n${result}`;
    } catch (error) {
        return `Error listing code: ${error.message}`;
    }
}

module.exports = {
    execute: listCode,
    intentSchema: {
        name: 'listCode',
        domain: 'FILES',
        triggers: ["list code","source files","project structure"],
        requiredEntities: [],
        extractParams: (message, entities) => {
        if (message.toLowerCase().includes('source')) return ['src'];
        return [''];
    }
    }
};
