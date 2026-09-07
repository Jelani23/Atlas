const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

const calls = [];
const fakeSupabase = {
    async rpc(name, args) {
        calls.push({ name, args });
        return { data: name === 'merge_equivalent_knowledge_records' ? 91 : true, error: null };
    }
};
const supabasePath = require.resolve('../src/database/supabaseClient');
require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: fakeSupabase
};

const repository = require('../src/memory/knowledgeCleanupRepository');

async function run() {
    await assert.rejects(() => repository.mergeEquivalentRecords(4, 4, 'same'), /different/);
    await assert.rejects(() => repository.mergeEquivalentRecords(4, 5, ''), /reason/);
    await assert.rejects(() => repository.revertMerge('bad', 'reason'), /positive/);

    const event = await repository.mergeEquivalentRecords(4, 5, 'Reviewed equivalent claims.');
    assert.strictEqual(event, 91);
    assert.deepStrictEqual(calls[0], {
        name: 'merge_equivalent_knowledge_records',
        args: { p_source_id: 4, p_target_id: 5, p_reason: 'Reviewed equivalent claims.' }
    });

    await repository.revertMerge(91, 'Wrong survivor.');
    assert.strictEqual(calls[1].name, 'revert_knowledge_merge');
    console.log('knowledgeCleanupRepository.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
