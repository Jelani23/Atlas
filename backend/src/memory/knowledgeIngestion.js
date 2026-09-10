const { groundedKnowledgeTopics } = require('./knowledgeTopicPolicy');

async function ingestDecision(decision, library) {
    const { memory, existing, semantic } = decision;
    const equivalent = semantic?.relation === 'equivalent';
    const canonicalValue = equivalent && existing ? existing.value : memory.value;
    const topics = [...new Set([...(existing?.topics || []), ...(memory.topics || [])])];
    return library.upsertKnowledge({
        category: memory.knowledge_category || 'general',
        subject: memory.subject || 'general', key: memory.key,
        value: memory.value, type: memory.type,
        topics: groundedKnowledgeTopics({ ...memory, value: canonicalValue }, topics),
        confidence: memory.confidence ?? 1,
        source: memory.source, source_type: memory.source_type
    }, {
        expected: existing || null,
        equivalent,
        forceReview: decision.action === 'conflict',
        reason: decision.reason
    });
}

module.exports = { ingestDecision };
