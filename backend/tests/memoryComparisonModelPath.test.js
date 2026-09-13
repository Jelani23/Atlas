const assert = require('node:assert/strict');
const adapterPath = require.resolve('../src/models/modelAdapter');
let response;
let request;
let assertion = { incoming: 'asserted', stored: 'asserted', reason: 'Both report actual behavior' };
let assertionCalls = 0;
require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true, exports: {
    createModelAdapter: () => ({ complete: async (messages, options) => {
        if (options.format.properties.incoming) { assertionCalls++; return JSON.stringify(assertion); }
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
    const phases = [];
    const decision = await evaluateWithModel(incoming, rows, { signal, onModelCall: phase => phases.push(phase) });
    assert.deepEqual(phases, ['identity']);
    assert.equal(assertionCalls, 0, 'Normal comparison must not enable the regressed experiment');
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
    const before = assertionCalls;
    assert.equal((await resolveMemory(incoming, { rows })).matched, false);
    assert.equal(assertionCalls, before, 'Do not spend another model call on a rejected identity');
    response = { ...response, entity: 'same', values: 'incompatible' };
    assertion = { ...assertion, incoming: 'required' };
    assert.equal((await resolveMemory(incoming, { rows })).relation, 'conflict', 'Normal ingestion retains the baseline comparison');
    const experimental = (memory, candidates) => evaluateWithModel(memory, candidates, {
        signal, experimentalAssertionCheck: true, onModelCall: phase => phases.push(phase)
    });
    const separate = await resolveMemory(incoming, { rows, evaluate: experimental });
    assert.equal(separate.matched, false, 'Opt-in mode boundary survives the full model adapter path');
    assert.ok(!separate.reviewRequired, 'A known assertion boundary must not be reinterpreted as uncertainty about the same identity');
    assert.equal(separate.memory, incoming, 'Do not retarget a requirement onto an actual-state record');
    assert.deepEqual(phases, ['identity', 'identity', 'assertion']);
    assertion = null;
    assert.equal((await resolveMemory(incoming, { rows, evaluate: experimental })).invalidResponse, true, 'Malformed secondary output must defer insertion');
    console.log('memoryComparisonModelPath.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
