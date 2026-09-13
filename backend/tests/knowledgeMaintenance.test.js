const assert = require('node:assert/strict');
const { createPlan, validatePlan, applyPlan, RECOVERY_AGE_MS } = require('../src/memory/knowledgeMaintenance');
const { parseArgs } = require('../scripts/maintainKnowledge');
async function run() {
    const now = Date.now();
    const row = { id: 8, category: 'technology', subject: 'fixture', key: 'capacity', value: '20 MB',
        verification_status: 'pending', verification_attempts: 2, updated_at: new Date(now - RECOVERY_AGE_MS - 1000).toISOString() };
    const recovery = createPlan('recover_verification', row, null, 'Interrupted run', now);
    assert.equal(recovery.expected_current, row);
    assert.throws(() => createPlan('recover_verification', { ...row, updated_at: new Date(now).toISOString() }, null, 'Too soon', now), /30 minutes/);
    assert.throws(() => createPlan('recover_verification', { ...row, updated_at: 'not a date' }, null, 'Bad'), /snapshot/);
    assert.throws(() => createPlan('recover_verification', { ...row, verification_attempts: 0 }, null, 'No attempt'), /pending attempt/);
    const after = { ...row, verification_status: 'unverified' };
    const before = { ...after, value: '10 MB' };
    const review = { id: 3, existing_id: 8, status: 'resolved', resolution_action: 'accept_provisional', resolution_before: before, resolution_after: after };
    const undo = createPlan('undo_review', after, review, 'Restore original claim');
    for (const verification_status of ['verified', 'pending', 'superseded', 'contradicted']) {
        assert.throws(() => createPlan('undo_review', { ...after, verification_status }, review, 'test'), /changed|snapshot/);
    }
    assert.throws(() => createPlan('undo_review', { ...after, topics: ['new'] }, review, 'test'), /newer work/);
    assert.throws(() => createPlan('undo_review', after, { ...review, status: 'dismissed' }, 'test'), /provisional/);
    assert.throws(() => createPlan('undo_review', after, { ...review, resolution_before: { ...before, key: 'elsewhere' } }, 'test'), /identity/);
    for (const plan of [null, { ...undo, reason: '' }, { ...undo, record_id: -1 }, { ...recovery, review_id: 3 }]) assert.throws(() => validatePlan(plan));
    for (const plan of [recovery, undo]) {
        let calls = 0;
        await applyPlan({ rpc: async (name, args) => {
            calls++;
            assert.equal(name, 'maintain_knowledge_record');
            assert.deepEqual(args.p_expected_current, plan.expected_current);
            assert.deepEqual(args.p_expected_review, plan.expected_review);
            return { data: { action: plan.action, record_id: 8, review_id: plan.review_id, event_id: 1 } };
        } }, plan);
        assert.equal(calls, 1);
    }
    await assert.rejects(applyPlan({ rpc: async () => ({ error: { code: 'PGRST202', message: 'Missing RPC' } }) }, undo), /migration 013/);
    await assert.rejects(applyPlan({ rpc: async () => ({ data: {} }) }, undo), /Inspect/);
    assert.equal(parseArgs(['--action', 'recover_verification', '--record', '8', '--reason', 'Interrupted'])['--record'], '8');
    assert.equal(parseArgs(['--action', 'undo_review', '--review', '3', '--reason', 'Mistake'])['--review'], '3');
    assert.deepEqual(parseArgs(['--apply', 'plan.json']), { apply: 'plan.json' });
    for (const args of [[], ['--apply'], ['--apply', 'p', '--record', '8'], ['--action', 'recover_verification', '--record', '8', '--review', '3', '--reason', 'bad'], ['--action', 'undo_review', '--record', '8', '--reason', 'bad']]) assert.throws(() => parseArgs(args));
    console.log('knowledgeMaintenance.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
