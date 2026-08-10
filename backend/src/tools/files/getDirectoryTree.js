// src/tools/files/getDirectoryTree.js
const fs = require('fs');
const path = require('path');
const { findDirectoryRecursive } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function getDirectoryTree(dirName = '') {
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
            else return `Error: Directory ${dirName} not found.`;
        }
        if (!targetPath.startsWith(basePath)) return "Error: Cannot read outside project directory.";

        const buildTree = (dir, prefix = '') => {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            let result = '';
            files.forEach((file, index) => {
                if (file.name === 'node_modules' || file.name === '.git' || file.name === '.env') return;
                const isLast = index === files.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                result += `${prefix}${connector}${file.name}\n`;
                if (file.isDirectory()) {
                    const newPrefix = prefix + (isLast ? '    ' : '│   ');
                    result += buildTree(path.join(dir, file.name), newPrefix);
                }
            });
            return result;
        };
        const tree = buildTree(targetPath);
        return `Directory Tree:\n${tree}`;
    } catch (error) {
        return `Error generating tree: ${error.message}`;
    }
}

module.exports = {
    execute: getDirectoryTree,
    intentSchema: {
        name: 'getDirectoryTree',
        domain: 'FILES',
        triggers: ["directory tree","tree view"],
        requiredEntities: [],
        extractParams: (message, entities) => { return ['']; }
    }
};
