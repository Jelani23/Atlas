// backend/src/tools/files/findFile.js
const projectCache = require('../../core/projectCache');

async function findFile(query) {
    try {
        const foundPath = projectCache.findFile(query);
        return foundPath ? `Found file: ${foundPath}` : `Could not find a file matching: ${query}`;
    } catch (error) {
        return `Error finding file: ${error.message}`;
    }
}

module.exports = {
    execute: findFile,
    intentSchema: {
        name: 'findFile',
        domain: 'FILES',
        triggers: ['find', 'locate', 'where is'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const queryMatch = message.match(/(?:find|locate|where is)\s+(?:me\s+|the\s+|your\s+)?(.+?)(?:\s+(?:file|module|script))?(?:\?|$)/i);
            return [queryMatch ? queryMatch[1].trim() : null];
        }
    }
};