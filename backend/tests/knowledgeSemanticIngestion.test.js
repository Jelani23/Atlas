// Cross-module integration: real comparison/guards/manager/ingestion mapper;
// only the model and storage boundary are simulated. No network or database writes.
const assert = require('node:assert/strict');
function stub(name, value) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports: value };
}
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
const current = { id: 7, category: 'technology', subject: 'fixture_server', key: 'storage', value: 'Uses SQLite',
    verification_status: 'verified', topics: ['storage'], updated_at: '2026-01-01', verification_attempts: 1 };
let comparison;
let modelFailure = false;
let modelCalls = 0;
const writes = [];
stub('../src/models/modelAdapter', { createModelAdapter: () => ({ complete: async (messages, options) => {
    modelCalls++;
    if (modelFailure) throw new Error('Fixture model unavailable');
    assert.ok(!options.format.properties.incoming, 'Production ingestion must not run the experimental assertion pass');
    return JSON.stringify(comparison);
} }) });
stub('../src/memory/knowledgeLibrary', {
    find: async (category, subject, key) => key === current.key ? current : null,
    getAll: async () => [current],
    upsertKnowledge: async (candidate, options) => {
        writes.push({ candidate, options });
        if (options.forceReview || (options.expected && !options.equivalent && candidate.value !== current.value)) {
            return { action: 'review', review_id: 3, reason: 'Fixture queued proposal' };
        }
        return options.expected ? { action: 'refreshed', record_id: 7 } : { action: 'inserted', record_id: 8 };
    }
});
stub('../src/memory/projectRegistry', { getAllProjects: async () => [] });
const { handleMemoryAction } = require('../src/memory/memoryManager');
async function run() {
    const incoming = { category: 'knowledge', knowledge_category: 'technology', subject: 'fixture_server', key: 'database', value: 'SQLite stores the data' };
    comparison = { candidate_index: 0, entity: 'same', property: 'same', scope: 'same', values: 'equivalent', replacement_quote: '', confidence: 0.98, reason: 'Same storage engine' };
    assert.equal((await handleMemoryAction(incoming)).action, 'duplicate');
    assert.equal(writes.at(-1).candidate.key, 'storage');
    assert.equal(writes.at(-1).options.equivalent, true);
    assert.equal(writes.at(-1).options.expected, current);
    assert.equal((await handleMemoryAction({ ...incoming, key: 'storage' })).action, 'duplicate',
        'An exact identity with paraphrased wording must also reach semantic comparison');
    assert.equal(writes.at(-1).options.equivalent, true);
    assert.equal(current.verification_status, 'verified', 'Equivalent refresh does not erase existing trust');
    const callsBeforeExact = modelCalls;
    assert.equal((await handleMemoryAction({ ...incoming, key: 'storage', value: current.value })).action, 'duplicate');
    assert.equal(modelCalls, callsBeforeExact, 'Identical wording retains the fast path');
    comparison = { ...comparison, values: 'incompatible' };
    assert.equal((await handleMemoryAction({ ...incoming, value: 'Uses PostgreSQL' })).action, 'conflict');
    assert.equal(writes.at(-1).options.forceReview, true);
    assert.equal(current.value, 'Uses SQLite');
    modelFailure = true;
    assert.equal((await handleMemoryAction({ ...incoming, key: 'storage', value: 'Uses PostgreSQL' })).action, 'conflict',
        'A failed comparison for an existing identity still preserves the proposal in review');
    assert.equal(writes.at(-1).options.forceReview, true);
    const writesBeforeFailure = writes.length;
    assert.equal((await handleMemoryAction({ ...incoming, key: 'unresolved_alias' })).action, 'ignored');
    assert.equal(writes.length, writesBeforeFailure, 'Provider failure cannot justify inserting an alias');
    modelFailure = false;
    current.verification_status = 'needs_source';
    comparison = { ...comparison, candidate_index: -1, entity: 'same', property: 'same', scope: 'same' };
    const writesBeforeInvalid = writes.length;
    assert.equal((await handleMemoryAction({ ...incoming, key: 'new_alias' })).action, 'ignored');
    assert.equal(writes.length, writesBeforeInvalid, 'Invalid comparison cannot justify a new knowledge row');
    comparison = { ...comparison, candidate_index: 0, scope: 'different', replacement_quote: 'Invented replacement evidence' };
    assert.equal((await handleMemoryAction({ ...incoming, key: 'quote_failure_alias' })).action, 'ignored');
    assert.equal(writes.length, writesBeforeInvalid, 'Ungrounded evidence must not turn a failed comparison into a new row');
    comparison = { ...comparison, scope: 'same', replacement_quote: '' };
    comparison = { ...comparison, candidate_index: 0 };
    for (const uncertain of [
        { values: 'uncertain', confidence: 0.7 },
        { values: 'equivalent', confidence: 0.2 },
        { property: 'different', values: 'uncertain', confidence: 0.6 },
        { property: 'uncertain', values: 'uncertain', confidence: 0.95 }
    ]) {
        comparison = { ...comparison, property: 'same', ...uncertain };
        const outcome = await handleMemoryAction({ ...incoming, key: 'storage_description' });
        assert.equal(outcome.action, 'conflict', 'Uncertain same-identity aliases must queue review, not insert');
        assert.equal(writes.at(-1).options.forceReview, true);
        assert.equal(writes.at(-1).options.equivalent, false, 'Review must not inherit equivalent refresh authority');
        assert.equal(writes.at(-1).options.expected, current);
        assert.equal(current.value, 'Uses SQLite');
    }
    comparison = { ...comparison, property: 'same', values: 'incompatible', confidence: 0.98 };
    // This checks routing after a scope rejection, not live model accuracy.
    comparison = { ...comparison, scope: 'different', reason: 'Requirement versus runtime' };
    const policy = await handleMemoryAction({ ...incoming, key: 'required_storage', value: 'Storage must use PostgreSQL' });
    assert.equal(policy.action, 'saved');
    assert.equal(writes.at(-1).candidate.key, 'required_storage', 'Do not retarget a requirement onto the actual-state record');
    assert.equal(writes.at(-1).options.expected, null);
    assert.equal(writes.at(-1).options.equivalent, false);
    assert.equal((await handleMemoryAction({ ...incoming, key: 'storage', value: 'Storage must use PostgreSQL' })).action, 'conflict',
        'An exact-key collision still goes to guarded review, never a direct overwrite');
    assert.equal(current.value, 'Uses SQLite');
    console.log('knowledgeSemanticIngestion.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
