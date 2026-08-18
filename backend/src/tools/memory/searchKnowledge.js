// src/tools/memory/searchKnowledge.js
const knowledgeLibrary = require('../../memory/knowledgeLibrary');

async function searchKnowledge(query) {
    const results = await knowledgeLibrary.search(query);
    if (results.length === 0) return "No knowledge found for that query.";
    // Phase: topics were being fetched from the DB just fine but silently
    // dropped from the formatted output - the field never made it in front
    // of Alice even though it was stored correctly.
    return results.map(r => {
        const topicsLine = Array.isArray(r.topics) && r.topics.length > 0
            ? `\nTopics: ${r.topics.join(', ')}`
            : '';
        return `Subject: ${r.subject}\nKey: ${r.key}${topicsLine}\nValue:\n${r.value}`;
    }).join('\n---\n');
}

module.exports = {
    execute: searchKnowledge,
    intentSchema: {
        name: 'searchKnowledge',
        domain: 'MEMORY',
        triggers: ['knowledge library', 'search knowledge', 'search library', 'query knowledge'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:knowledge library for|knowledge for|search knowledge for)\s+(.*)/i);
            return [m ? m[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};
