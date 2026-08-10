// src/tools/memory/searchKnowledge.js
const knowledgeLibrary = require('../../memory/knowledgeLibrary');

async function searchKnowledge(query) {
    const results = await knowledgeLibrary.search(query);
    if (results.length === 0) return "No knowledge found for that query.";
    return results.map(r => `Subject: ${r.subject}\nKey: ${r.key}\nValue:\n${r.value}`).join('\n---\n');
}

module.exports = {
    execute: searchKnowledge,
    intentSchema: {
        name: 'searchKnowledge',
        domain: 'MEMORY',
        triggers: ['knowledge library', 'knowledge', 'search knowledge'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:knowledge library for|knowledge for|search knowledge for)\s+(.*)/i);
            return [m ? m[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};
