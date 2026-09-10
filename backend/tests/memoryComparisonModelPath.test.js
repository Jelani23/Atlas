const assert = require('node:assert/strict');
const adapterPath = require.resolve('../src/models/modelAdapter');
let response;
let request;
require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true, exports: {
    createModelAdapter: () => ({ complete: async (messages, options) => {
        request = { messages, options };
        return JSON.stringify(response);
    } })
} };
const { evaluateWithModel, resolveMemory } = require('../src/memory/memoryCanonicalizer');
const incoming = { category: 'knowledge', subject: 'sample_server', key: 'access', value: 'Access is not allowed' };
const rows = [{ id: 1, category: 'technology', subject: 'sample_server', key: 'access_policy', value: 'Access is allowed' }];
async function run() {
    response = { candidate_index: 0, entity: 'same', property: 'same', scope: 'same', values: 'incompatible', replacement_quote: '', confidence: 0.96, reason: 'Opposite answers to one property' };
    const signal = new AbortController().signal;
    const decision = await evaluateWithModel(incoming, rows, { signal });
    assert.equal(decision.relation, 'conflict');
    assert.equal(request.options.signal, signal);
    assert.ok(request.options.format.properties.entity);
    assert.ok(!request.options.format.properties.relation, 'The classifier supplies dimensions, not the final route');
    const resolved = await resolveMemory(incoming, { rows });
    assert.equal(resolved.relation, 'conflict');
    assert.equal(resolved.existing.id, 1);
    response = { ...response, values: 'equivalent' };
    assert.equal((await resolveMemory(incoming, { rows })).matched, false, 'Equivalence veto still runs after comparison');
    response = { ...response, entity: 'uncertain' };
    assert.equal((await resolveMemory(incoming, { rows })).matched, false);
    console.log('memoryComparisonModelPath.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
