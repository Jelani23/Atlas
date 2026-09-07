const assert = require('node:assert/strict');
const { validateChanges, previewCleanup, applyCleanup, rollbackCleanup, createTopicRepository } = require('../src/memory/knowledgeTopicCleanup');

const original = { id: 1, subject: 'test', key: 'feature', value: 'A stored claim', topics: ['test', 'unrelated'], updated_at: 'old', verification_status: 'verified', verification_sources: [{ url: 'https://example.test/source' }] };
const plan = { version: 1, changes: [{ id: 1, expected: structuredClone(original), topics: ['test'], reason: 'Reviewed unrelated tag.' }] };
async function run() {
    assert.throws(() => validateChanges({ ...plan, changes: [{ ...plan.changes[0], topics: ['new'] }] }), /only remove/);
    assert.throws(() => validateChanges({ ...plan, changes: [plan.changes[0], plan.changes[0]] }), /unique/);
    let row = structuredClone(original);
    const events = [];
    const repository = {
        get: async () => structuredClone(row),
        replaceTopics: async (before, topics) => {
            assert.equal(row.updated_at, before.updated_at);
            row = { ...row, topics, updated_at: row.updated_at + '-next' };
            return structuredClone(row);
        }
    };
    const snapshots = await previewCleanup(plan, repository);
    await assert.rejects(() => applyCleanup(snapshots, repository, async () => { throw new Error('disk full'); }), /disk full/);
    assert.deepEqual(row, original, 'Journal must succeed before a write.');
    await applyCleanup(snapshots, repository, e => events.push(e));
    assert.deepEqual(row.topics, ['test']);
    assert.equal(row.verification_status, 'verified');
    assert.deepEqual(row.verification_sources, original.verification_sources);
    await assert.rejects(() => previewCleanup(plan, repository), /changed since review/);
    const applied = structuredClone(row);
    row.value = 'Later edit';
    await assert.rejects(() => rollbackCleanup(events, repository, e => events.push(e)), /changed since review/);
    row = applied;
    await rollbackCleanup(events, repository, e => events.push(e));
    assert.deepEqual(row.topics, original.topics);
    await assert.rejects(() => rollbackCleanup([{ event: 'intent', id: 5 }], repository, () => {}), /uncertain/);

    let payload;
    const filters = [];
    const chain = { eq: (key, val) => { filters.push([key, val]); return chain; }, select: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    const client = { from: () => ({ update: data => { payload = data; return chain; } }) };
    await assert.rejects(() => createTopicRepository(client).replaceTopics(original, ['test']), /changed during cleanup/);
    assert.deepEqual(payload, { topics: ['test'] });
    assert.deepEqual(filters, [['id', 1], ['updated_at', 'old']]);
    console.log('knowledgeTopicCleanup.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
