const { readRange, formatRange } = require('../../core/sourceReader');

async function readCode(filePaths, startLine = 1, lineCount = 80, expectedVersion) {
    try {
        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        if (!files.length || files.length > 3) throw new Error('Read between one and three files at a time.');
        if (files.length > 1 && expectedVersion) throw new Error('Version checking requires a single file.');
        return files.map(file => formatRange(readRange(file, startLine, lineCount, expectedVersion))).join('\n\n');
    } catch (error) { return `Error reading code: ${error.message}`; }
}

module.exports = {
    execute: readCode,
    intentSchema: {
        name: 'readCode', domain: 'FILES',
        matchesRequest: message => Boolean(require('../../intent/sourceRequest').parseSourceRead(message)),
        triggers: ['read the code for', 'read me the code for', 'read code for', 'show the code for', 'show me the code for', 'open the code for', 'inspect the code for', 'read code', 'read me the code', 'read file', 'read the file', 'read me the file', 'read'],
        requiredEntities: ['FILE'],
        extractParams: message => require('../../intent/sourceRequest').parseSourceRead(message) || [null]
    }
};
