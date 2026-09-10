const assert = require('node:assert/strict');
const { createVerificationWrites } = require('../src/memory/knowledgeVerificationWrites');

async function run() {
    let row = { id: 1, value: 'Original claim', updated_at: '2026-01-01T00:00:00Z', verification_status: 'unverified', verification_attempts: 0 };
    const operations = [];
    const client = { from: table => {
        assert.equal(table, 'knowledge_library');
        let update;
        const filters = [];
        const query = {
            update: data => { update = data; return query; },
            eq: (key, value) => { filters.push([key, value]); return query; },
            select: () => query,
            maybeSingle: async () => {
                operations.push({ update, filters });
                if (!filters.every(([key, value]) => row[key] === value)) return { data: null };
                row = { ...row, ...update };
                return { data: { ...row } };
            }
        };
        return query;
    } };
    const writes = createVerificationWrites(client, () => '2026-01-02T00:00:00Z');
    const original = { ...row };
    const starts = await Promise.allSettled([writes.begin(1, original), writes.begin(1, original)]);
    assert.equal(starts.filter(item => item.status === 'fulfilled').length, 1, 'Only one worker can claim the same snapshot');
    const claimed = starts.find(item => item.status === 'fulfilled').value;
    assert.equal(row.verification_attempts, 1);
    assert.equal(row.verification_status, 'pending');
    assert.deepEqual(operations[0].filters.map(([key]) => key), ['id', 'value', 'updated_at', 'verification_status', 'verification_attempts']);
    await assert.rejects(writes.begin(1, claimed), /already being verified/);
    await assert.rejects(writes.apply(1, { verification_status: 'verified' }), /complete expected/);

    row = { ...row, value: 'Newer claim' };
    await assert.rejects(writes.apply(1, { value: 'Stale claim', verification_status: 'verified' }, claimed), /stale result was not applied/);
    await assert.rejects(writes.apply(1, { verification_status: 'failed' }, claimed), /stale result was not applied/);
    assert.equal(row.value, 'Newer claim');
    assert.equal(row.verification_status, 'pending');

    row = { ...original };
    const fresh = await writes.begin(1, row);
    const finished = await writes.apply(1, { verification_status: 'verified' }, fresh);
    assert.equal(finished.verification_status, 'verified');
    await assert.rejects(writes.apply(1, { verification_status: 'failed' }, fresh), /stale result was not applied/);
    assert.equal(row.verification_status, 'verified', 'Late error cleanup cannot undo success');
    await assert.rejects(writes.begin(1, { ...row, verification_status: 'superseded' }), /superseded/);
    console.log('knowledgeVerificationWrites.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
