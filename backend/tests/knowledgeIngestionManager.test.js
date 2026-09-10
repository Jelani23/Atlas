const assert = require('node:assert/strict');
function fake(module, value) {
    const id = require.resolve(module);
    require.cache[id] = { id, filename: id, loaded: true, exports: value };
}
process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';
let existing = { id: 7, category: 'technology', subject: 'sample', key: 'capacity', value: '10 MB', verification_status: 'unverified' };
let response = { action: 'review', review_id: 4, reason: 'Changed value' };
let writes = [];
fake('../src/memory/knowledgeLibrary', {
    find: async (_category, _subject, key) => key === 'new_property' ? null : existing,
    upsertKnowledge: async (candidate, options) => {
        writes.push({ candidate, options });
        if (response instanceof Error) throw response;
        return candidate.key === 'new_property' ? { action: 'inserted', record_id: 8 } : response;
    }
});
fake('../src/memory/memoryCanonicalizer', { resolveMemory: async memory => ({ matched: false, relation: 'distinct', memory }) });
fake('../src/memory/projectRegistry', { getAllProjects: async () => [] });
const manager = require('../src/memory/memoryManager');
const incoming = { category: 'knowledge', knowledge_category: 'technology', subject: 'sample', key: 'capacity', value: '20 MB' };
async function run() {
    const result = await manager.handleMemoryAction(incoming);
    assert.equal(result.action, 'conflict');
    assert.equal(result.conflicts[0].review_id, 4);
    assert.equal(result.memories.length, 0);
    assert.equal(writes[0].options.expected.id, 7);
    assert.equal(existing.value, '10 MB');
    existing = { ...existing, verification_status: 'verified' };
    writes = [];
    await manager.handleMemoryAction({ ...incoming, value: '10 Mb' });
    assert.equal(writes[0].options.forceReview, true, 'Case-sensitive units cannot bypass verified protection');
    const mixed = await manager.handleMemoryAction([incoming, { ...incoming, key: 'new_property' }]);
    assert.equal(mixed.action, 'saved_with_conflicts');
    assert.equal(mixed.conflicts.length, 1);
    assert.equal(mixed.memories.length, 1);
    response = new Error('Migration missing');
    const failed = await manager.handleMemoryAction(incoming);
    assert.equal(failed.action, 'ignored');
    assert.equal(failed.memories.length, 0);
    assert.equal(failed.conflicts.length, 0, 'Do not claim a durable queue entry when writing it failed');
    console.log('knowledgeIngestionManager.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
