// src/tools/files/getChangedFiles.js
const projectCache = require('../../core/projectCache');

async function getChangedFiles() {
    try {
        const changed = projectCache.getChangedFiles();
        if (changed.length === 0) return "No files have changed since the cache was built.";
        return `The following ${changed.length} file(s) have changed on disk:\n${changed.join('\n')}`;
    } catch (error) {
        return `Error getting changed files: ${error.message}`;
    }
}

module.exports = {
    execute: getChangedFiles,
    intentSchema: {
        name: 'getChangedFiles',
        domain: 'FILES',
        triggers: ["changed files", "modified files", "recently changed", "what files changed", "git status"],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};