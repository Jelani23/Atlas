const assert = require('node:assert/strict');
const { createPlan, validatePlan, applyPlan } = require('../src/memory/knowledgeReviewResolution');
const { parseArgs } = require('../scripts/resolveKnowledgeReview');
async function run() {
    const candidate = { category: 'technology', subject: 'fixture', key: 'size', value: '20 MB' };
    const current = { ...candidate, id: 8, value: '10 MB', verification_status: 'unverified', updated_at: '2026-01-01', verification_attempts: 0 };
    const review = { id: 2, existing_id: 8, candidate, status: 'pending' };
    const details = { review, current_record: current };
    const plan = createPlan(details, 'accept_provisional', 'Reviewed replacement');
    let calls = 0;
    const client = { rpc: async (name, args) => {
        calls++;
        assert.equal(name, 'resolve_knowledge_ingestion_review');
        assert.deepEqual(args.p_expected_current, current);
        assert.deepEqual(args.p_expected_review, review);
        return { data: { action: 'accept_provisional', review_id: 2, record_id: 8 } };
    } };
    assert.equal(calls, 0, 'Preview is pure');
    await applyPlan(client, plan);
    assert.equal(calls, 1);
    for (const status of ['verified', 'pending', 'superseded', 'contradicted']) {
        assert.throws(() => createPlan({ ...details, current_record: { ...current, verification_status: status } }, 'accept_provisional', 'test'), /cannot replace/);
    }
    assert.throws(() => createPlan(null, 'dismiss', 'test'), /not found/);
    assert.throws(() => createPlan(details, 'verify', 'test'), /complete/);
    assert.throws(() => createPlan(details, 'dismiss', ' '), /complete/);
    assert.throws(() => createPlan({ ...details, current_record: null }, 'accept_provisional', 'test'), /cannot replace/);
    assert.equal(createPlan({ ...details, current_record: null }, 'dismiss', 'Missing target').action, 'dismiss');
    assert.throws(() => createPlan({ ...details, review: { ...review, candidate: { ...candidate, subject: 'elsewhere' } } }, 'accept_provisional', 'test'), /identity/);
    assert.throws(() => validatePlan({ ...plan, expected_current: undefined }), /does not match/);
    await assert.rejects(applyPlan({ rpc: async () => ({ error: { code: 'PGRST202', message: 'Missing' } }) }, plan), /migration 012/);
    await assert.rejects(applyPlan({ rpc: async () => ({ data: { action: 'dismiss', review_id: 2 } }) }, plan), /matching confirmation/);
    assert.deepEqual(parseArgs(['--apply', 'review.json']), { apply: 'review.json' });
    assert.equal(parseArgs(['--review', '2', '--action', 'dismiss', '--reason', 'Duplicate'])['--review'], '2');
    for (const args of [[], ['--apply'], ['--apply', 'a', '--review', '2'], ['--review', '2', '--review', '3'], ['--approve', 'all']]) {
        assert.throws(() => parseArgs(args));
    }
    console.log('knowledgeReviewResolution.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
