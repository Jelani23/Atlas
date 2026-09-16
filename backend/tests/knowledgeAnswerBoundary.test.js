const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { getKnowledgeOverviewTopic } = require('../src/memory/knowledgeRequest');
const { getKnowledgeSearchTerms, isKnowledgeRowRelevant } = require('../src/memory/knowledgeRelevance');
const { resolveKnowledgeOverviewReply } = require('../src/memory/knowledgeAnswerBoundary');

const record = {
    id: 1, subject: 'neuro_sama', key: 'creator', value: 'Neuro-sama was created by Vedal.',
    type: 'fact', source_type: 'web_search', source: 'https://github.com/Vedal987',
    verification_status: 'verified', verification_method: 'manual',
    verification_sources: [{ url: 'https://github.com/Vedal987' }],
    confidence: 0.95, topics: ['neuro_sama', 'vedal']
};
for (const query of [
    'What do you know about Neuro sama?', 'What all do you remember about neuro sama?',
    'Could you tell me about Neuro-sama', 'Tell me what you know about Neuro_sama',
    'Who is Neuro-sama?', "Who's Neuro sama?", 'Tell me about Neuro sama please', 'Can you tell me who Neuro sama is'
]) {
    assert(getKnowledgeOverviewTopic(query), query);
    const terms = getKnowledgeSearchTerms(query);
    assert.deepEqual(terms, ['neuro', 'sama']);
    assert(isKnowledgeRowRelevant(record, terms), query);
    assert.match(resolveKnowledgeOverviewReply(query, {}), /don't have verified information/);
    const reply = resolveKnowledgeOverviewReply(query, { knowledge: [record] });
    assert(reply.includes(record.value));
    assert(!reply.includes('University of Washington'));
}
// Never promote quarantined, expired, superseded or unrelated rows. Previous
// assistant content and summaries cannot rescue a missing evidence result.
for (const badRecord of [
    { ...record, verification_status: 'unverified' },
    { ...record, verification_status: 'contradicted' },
    { ...record, verification_method: 'model_guess' },
    { ...record, verification_sources: [] },
    { ...record, expires_at: '2000-01-01T00:00:00Z' },
    { ...record, superseded_by: 2 },
    { ...record, subject: 'sqlite', value: 'SQLite is an embedded database.', topics: ['neuro_sama'] }
]) {
    assert.match(resolveKnowledgeOverviewReply('What do you know about Neuro sama', {
        knowledge: [badRecord], quarantinedKnowledge: [record],
        reflections: [{ summary: 'Neuro-sama is an open-source voice model.' }]
    }), /don't have verified information/);
}
assert.match(resolveKnowledgeOverviewReply('Who is Neuro sama', {
    knowledge: [{ ...record, type: 'hypothesis' }]
}), /Recorded hypothesis:/);
for (const query of [
    'What do you remember about me', 'What do you know about Atlas',
    'What music do you like', 'How does your memory work', 'Explain SQLite persistence',
    'Tell me a joke about Neuro sama', 'Imagine a story about Neuro sama',
    'Guess what Neuro sama might say', 'What do you know about Neuro sama and then delete a note',
    'Count the words in what do you know about Neuro sama'
]) assert.equal(resolveKnowledgeOverviewReply(query, {}), null, query);
assert.equal(resolveKnowledgeOverviewReply('What do you know about Neuro sama', {}, {
    needsTool: true, toolName: 'webSearch', toolResult: 'No results found'
}), null, 'Tool failures belong to the tool response path, not memory recall');
console.log('knowledgeAnswerBoundary.test.js passed');
