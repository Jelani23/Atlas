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
        // Phase: was bare ['find', 'locate'] - matched inside ordinary
        // conversation ("find a way to explain this", "let me locate that
        // memory") with no requiredEntities to fall back on, so those false
        // matches scored straight through to DETERMINISTIC and executed
        // findFile with whatever text followed as the query. Requiring the
        // explicit "file" word in the trigger itself (same fix pattern as
        // the LIST/convertTime tightening) keeps "find file X" / "find the
        // file X" working while conversational "find"/"locate" alone no
        // longer scores enough on its own (FILES domain lexical evidence for
        // find/locate/where-is is 0.4, under the 0.5 DETERMINISTIC floor) to
        // fire this tool.
        triggers: ['find the file', 'find a file', 'find file', 'locate the file', 'locate a file', 'locate file'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const queryMatch = message.match(/(?:find|locate|where is)\s+(?:me\s+|the\s+|your\s+)?(.+?)(?:\s+(?:file|module|script))?(?:\?|$)/i);
            return [queryMatch ? queryMatch[1].trim() : null];
        }
    }
};