// src/tools/files/searchCode.js
const projectCache = require('../../core/projectCache');

async function searchCode(query) {
    try {
        if (!query) return "Error: No search query provided.";
        const tree = projectCache.getTree();
        const lowerQuery = query.toLowerCase();
        const sttNormalizedQuery = lowerQuery.replace(/\s+/g, '');
        const matches = [];
        for (const filePath of tree) {
            const content = projectCache.getFile(filePath);
            if (content) {
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const lowerLine = lines[i].toLowerCase();
                    if (lowerLine.includes(lowerQuery) || lowerLine.includes(sttNormalizedQuery)) {
                        matches.push(`${filePath} (Line ${i + 1}): ${lines[i].trim()}`);
                        break;
                    }
                }
            }
        }
        if (matches.length === 0) return `No occurrences of "${query}" found in the project source.`;
        return `Found ${matches.length} occurrence(s) for "${query}":\n${matches.join('\n')}`;
    } catch (error) {
        return `Error searching code: ${error.message}`;
    }
}

module.exports = {
    execute: searchCode,
    intentSchema: {
        name: 'searchCode',
        domain: 'SEARCH', // Changed to SEARCH so it catches the lexical signal
        triggers: ['search code', 'grep', 'references to', 'search for'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const queryMatch = message.match(/(?:search code for|find in code|grep|do we use|any references to|where is|search for|search)\s+(.*?)(?:\s+anywhere|\s+in the code|\s+in the|\?|$)/i);
            return [queryMatch ? queryMatch[1].trim() : null];
        }
    }
};
