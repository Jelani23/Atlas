const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';
const { reverifyKnowledgeRecord } = require('../src/memory/knowledgeVerificationService');
const record = { id: 1, subject: 'sample', key: 'capacity', value: '10 MB', verification_status: 'unverified', verification_attempts: 0 };
const claimed = { ...record, verification_status: 'pending', verification_attempts: 1 };

function dependencies(overrides = {}) {
    const calls = [];
    return {
        calls,
        repository: {
            getById: async () => ({ ...record }),
            createVerificationRun: async () => 5,
            beginVerification: async () => claimed,
            applyVerification: async (id, update, lease) => { calls.push({ id, update, lease }); return { ...record, ...update }; },
            completeVerificationRun: async () => {},
            ...overrides
        },
        searchPipeline: { executeSearch: async () => '' }
    };
}
async function run() {
    const claimFailure = dependencies({ beginVerification: async () => { throw new Error('Someone else claimed it'); } });
    claimFailure.searchPipeline.executeSearch = async () => { throw new Error('Must not search'); };
    await assert.rejects(reverifyKnowledgeRecord(1, claimFailure), /Someone else claimed/);
    assert.equal(claimFailure.calls.length, 0, 'No ownership means no cleanup write');

    const noRun = dependencies({ createVerificationRun: async () => { throw new Error('Audit unavailable'); } });
    await assert.rejects(reverifyKnowledgeRecord(1, noRun), /Audit unavailable/);
    assert.equal(noRun.calls.length, 0);

    const success = dependencies();
    await reverifyKnowledgeRecord(1, success);
    assert.equal(success.calls[0].lease, claimed, 'Even insufficient evidence must write using the claimed snapshot');

    const searchFailure = dependencies();
    searchFailure.searchPipeline.executeSearch = async () => { throw new Error('Search failed'); };
    await assert.rejects(reverifyKnowledgeRecord(1, searchFailure), /Search failed/);
    assert.equal(searchFailure.calls[0].lease, claimed);
    assert.equal(searchFailure.calls[0].update.verification_status, 'failed');

    const auditFailure = dependencies({ completeVerificationRun: async () => { throw new Error('Audit finish failed'); } });
    await assert.rejects(reverifyKnowledgeRecord(1, auditFailure), /Audit finish failed/);
    assert.equal(auditFailure.calls.length, 1, 'Do not fail a record whose result was already saved');

    for (const status of ['pending', 'superseded']) {
        const skip = dependencies({ getById: async () => ({ ...record, verification_status: status }),
            createVerificationRun: async () => { throw new Error('Must not create run'); } });
        const text = await reverifyKnowledgeRecord(1, skip);
        assert.ok(text.includes(status));
        assert.equal(skip.calls.length, 0);
    }
    console.log('knowledgeVerificationOwnership.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
