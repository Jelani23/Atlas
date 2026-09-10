const assert = require('node:assert/strict');
const { createRepository } = require('../src/memory/knowledgeIngestionRepository');
const { readReviews } = require('../scripts/listKnowledgeIngestionReviews');

async function run() {
    const snapshot = { id: 7, value: 'Old', updated_at: '2026-01-01', verification_status: 'unverified', verification_attempts: 0 };
    let review = { id: 3, existing_id: 7, existing_snapshot: snapshot, candidate: { value: 'Proposed' }, status: 'pending' };
    let current = { ...snapshot };
    let failure = null;
    const reads = [];
    const repository = createRepository({ from(table) {
        const query = {
            select: () => query,
            eq: (key, value) => { reads.push({ table, key, value }); return query; },
            maybeSingle: async () => ({ data: table === 'knowledge_library' ? current : review, error: failure })
        };
        return query; // Deliberately no mutation methods.
    } });
    let detail = await repository.inspectReview('3');
    assert.equal(detail.changed_since_queued, false);
    assert.equal(detail.acceptance_authorized, false);
    assert.deepEqual(reads.map(row => row.table), ['knowledge_ingestion_reviews', 'knowledge_library']);
    current = { ...snapshot, value: 'New', verification_attempts: 1 };
    detail = await repository.inspectReview('3');
    assert.deepEqual(detail.changed_fields, ['value', 'verification_attempts']);
    assert.equal(detail.changed_since_queued, true);
    current = null;
    assert.equal((await repository.inspectReview('3')).changed_since_queued, null);
    review = { ...review, existing_id: null };
    const before = reads.length;
    await repository.inspectReview('3');
    assert.equal(reads.length, before + 1);
    review = null;
    assert.equal(await repository.inspectReview('3'), null);
    failure = { message: 'Unavailable' };
    await assert.rejects(repository.inspectReview('3'), /Unavailable/);
    await assert.rejects(repository.inspectReview('-3'), /positive integer/);
    await assert.rejects(repository.listPending(101), /between 1 and 100/);
    const fake = { listPending: async () => [{ id: 3 }], inspectReview: async id => id === '3' ? { review: { id: 3 } } : null };
    assert.equal((await readReviews([], fake)).pending, 1);
    assert.equal((await readReviews(['--id', '3'], fake)).found, true);
    assert.equal((await readReviews(['--id', '4'], fake)).found, false);
    for (const args of [['--approve', '3'], ['--id'], ['--id', '3x'], ['--id', '3', '--apply']]) {
        await assert.rejects(readReviews(args, fake), /Usage/);
    }
    console.log('knowledgeIngestionInspection.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
