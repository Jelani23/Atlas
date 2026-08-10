// src/tools/files/_utils.js
const fs = require('fs');
const path = require('path');

function findDirectoryRecursive(dir, targetDirName) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (file.name === 'node_modules' || file.name === '.git') continue;
            const fullPath = path.join(dir, file.name);
            if (file.name.toLowerCase() === targetDirName.toLowerCase()) return fullPath;
            const found = findDirectoryRecursive(fullPath, targetDirName);
            if (found) return found;
        }
    }
    return null;
}

module.exports = { findDirectoryRecursive };