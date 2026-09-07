const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

const calls = [];
const fakeSupabase = {
    async rpc(name, args) {
        calls.push({ name, args });
        return { data: name === 'apply_knowledge_decomposition' ? 12 : true, error: null };
    }
};
const supabasePath = require.resolve('../src/database/supabaseClient');
require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: fakeSupabase
};

const repository = require('../src/memory/knowledgeDecompositionRepository');

async function run() {
    assert.throws(() => repository.normalizeDestinationIds([4, 4]), /two distinct/);
    await assert.rejects(() => repository.applyDecomposition({
        sourceId: 4,
        destinationIds: [4, 5],
        components: [{}, {}],
        sourceUpdatedAt: '2026-09-03T12:00:00Z',
        reason: 'Reviewed.'
    }), /cannot be a destination/);

    const eventId = await repository.applyDecomposition({
        sourceId: 4,
        destinationIds: [6, 5, 6],
        components: [
            { source_span: 'First claim', destination_id: 5, relation: 'equivalent' },
            { source_span: 'Second claim', destination_id: 6, relation: 'equivalent' }
        ],
        sourceUpdatedAt: '2026-09-03T12:00:00Z',
        reason: 'Reviewed atomic coverage.'
    });
    assert.strictEqual(eventId, 12);
    assert.deepStrictEqual(calls[0], {
        name: 'apply_knowledge_decomposition',
        args: {
            p_source_id: 4,
            p_destination_ids: [5, 6],
            p_component_plan: [
                { source_span: 'First claim', destination_id: 5, relation: 'equivalent' },
                { source_span: 'Second claim', destination_id: 6, relation: 'equivalent' }
            ],
            p_expected_source_updated_at: '2026-09-03T12:00:00Z',
            p_reason: 'Reviewed atomic coverage.'
        }
    });

    await repository.revertDecomposition(12, 'Restore source.');
    assert.strictEqual(calls[1].name, 'revert_knowledge_decomposition');
    console.log('knowledgeDecompositionRepository.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
