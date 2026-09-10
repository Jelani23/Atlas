const assert = require('node:assert/strict');
const { createRepository } = require('../src/memory/knowledgeIngestionRepository');
const { ingestDecision } = require('../src/memory/knowledgeIngestion');
const { valuesEqual } = require('../src/memory/memoryDeduplicator');
async function run() {
    const candidate = { category: 'technology', subject: 'sample', key: 'size', value: '10 MB' };
    const expected = { id: 1, value: '10 Mb', verification_status: 'verified' };
    const calls = [];
    let reply = { data: { action: 'review', review_id: 3, reason: 'Review needed' } };
    const repository = createRepository({ rpc: async (name, args) => { calls.push({ name, args }); return reply; } });
    const result = await repository.ingest(candidate, { expected, forceReview: true, reason: 'Conflict' });
    assert.equal(result.review_id, 3);
    assert.equal(calls[0].name, 'ingest_knowledge_candidate');
    assert.deepEqual(calls[0].args.p_expected, expected);
    assert.equal(calls[0].args.p_force_review, true);
    assert.equal(valuesEqual('10 MB', '10 Mb', { caseSensitive: true }), false);
    reply = { error: { code: 'PGRST202', message: 'Function missing' } };
    await assert.rejects(repository.ingest(candidate), /Apply migration 011/);
    reply = { data: null };
    await assert.rejects(repository.ingest(candidate), /no confirmed write/);

    let passed;
    const rawValue = 'Uses ten megabytes';
    await ingestDecision({ action: 'duplicate', memory: { ...candidate, category: 'knowledge', knowledge_category: 'technology', value: rawValue },
        existing: expected, semantic: { relation: 'equivalent' } }, {
        upsertKnowledge: async (memory, options) => { passed = { memory, options }; return { action: 'refreshed', record_id: 1 }; }
    });
    assert.equal(passed.memory.value, rawValue, 'Store the incoming wording if a stale refresh becomes a review');
    assert.equal(passed.options.equivalent, true);
    assert.equal(passed.options.expected, expected);
    console.log('knowledgeIngestionRepository.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
