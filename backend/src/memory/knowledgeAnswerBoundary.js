const { getKnowledgeOverviewTopic } = require('./knowledgeRequest');
const { getKnowledgeSearchTerms, isKnowledgeRowRelevant } = require('./knowledgeRelevance');
const { isKnowledgeActive, isKnowledgeRetrievable } = require('./knowledgeAudit');

function resolveKnowledgeOverviewReply(input, relevantMemory = {}, toolResult = {}) {
    const topic = getKnowledgeOverviewTopic(input);
    // Actual executed tools retain their response path, including failed
    // searches. A model answer, reflection or search-status string alone is
    // never a substitute for stored verification evidence here.
    if (!topic || toolResult.needsTool) return null;
    const terms = getKnowledgeSearchTerms(topic);
    const rows = (relevantMemory.knowledge || []).filter(row =>
        row && isKnowledgeActive(row) && isKnowledgeRetrievable(row) &&
        isKnowledgeRowRelevant(row, terms) && String(row.value || '').trim());
    if (!rows.length) {
        return `I don't have verified information about ${topic} in the context available to me. I'd rather check a source than guess at the details. You can ask me to look it up.`;
    }
    const claims = [...new Set(rows.map(row => {
        const uncertain = ['claim', 'assumption', 'hypothesis'].includes(row.type);
        return `${uncertain ? `Recorded ${row.type}: ` : ''}${String(row.value).trim()}`;
    }))];
    return `Here's what the checked records available to me say: ${claims.join(' ')}${rows.some(row => row.expires_at) ? ' Time-sensitive details apply to the records’ last verification, not a live update.' : ''}`;
}

module.exports = { resolveKnowledgeOverviewReply };
