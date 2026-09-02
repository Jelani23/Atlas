// src/tools/memory/searchKnowledge.js
const knowledgeLibrary = require('../../memory/knowledgeLibrary');
const { isKnowledgeRetrievable } = require('../../memory/knowledgeAudit');
const { formatProvisionalKnowledge } = require('../../memory/knowledgeRecall');

async function searchKnowledge(query) {
    const results = await knowledgeLibrary.search(query);
    const trustedResults = results.filter(isKnowledgeRetrievable);
    const provisionalResults = results.filter(result => !isKnowledgeRetrievable(result));
    const trustedSummary = trustedResults.map(r => {
        const topicsLine = Array.isArray(r.topics) && r.topics.length > 0
            ? `\nTopics: ${r.topics.join(', ')}`
            : '';
        return `Subject: ${r.subject}\nKey: ${r.key}${topicsLine}\nValue:\n${r.value}`;
    }).join('\n---\n');
    const provisionalSummary = formatProvisionalKnowledge(provisionalResults, query);

    if (!trustedSummary && !provisionalSummary) return 'No knowledge found for that query.';
    return [trustedSummary, provisionalSummary].filter(Boolean).join('\n\n');
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
