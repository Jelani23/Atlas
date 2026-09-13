const assert = require('node:assert/strict');
const adapterPath = require.resolve('../src/models/modelAdapter');
let responses, calls;
require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true, exports: {
    createModelAdapter: () => ({ complete: async (messages, options) => {
        calls.push(options);
        if (options.signal.aborted) throw options.signal.reason;
        return responses.shift();
    } })
} };
const { evaluateWithModel } = require('../src/memory/memoryCanonicalizer');
const memory = { category: 'knowledge', subject: 'fixture', key: 'engine', value: 'Uses SQLite' };
const candidates = [{ ...memory, id: 1 }];
const valid = { candidate_index: 0, entity: 'same', property: 'same', scope: 'same', values: 'equivalent', replacement_quote: '', confidence: 0.97, reason: 'Same engine' };
async function run() {
    calls = []; responses = ['{"reason":"truncated', JSON.stringify(valid)];
    const signal = new AbortController().signal;
    let invalid = 0;
    const phases = [];
    const result = await evaluateWithModel(memory, candidates, { signal,
        onModelCall: phase => phases.push(phase), onInvalidResponse: () => invalid++ });
    assert.equal(result.relation, 'equivalent');
    assert.deepEqual(phases, ['identity', 'identity_retry']);
    assert.deepEqual(calls.map(c => c.maxTokens), [600, 1200]);
    assert.ok(calls.every(c => c.signal === signal), 'Both calls share one timeout/cancellation signal');
    assert.equal(invalid, 1);
    calls = []; responses = ['{}', 'not JSON'];
    assert.equal((await evaluateWithModel(memory, candidates)).invalidResponse, true);
    assert.equal(calls.length, 2, 'Malformed responses cannot create an unbounded retry loop');
    calls = []; responses = [JSON.stringify({ ...valid, candidate_index: -1 }), JSON.stringify(valid)];
    assert.equal((await evaluateWithModel(memory, candidates)).relation, 'equivalent');
    assert.equal(calls.length, 2, 'An inconsistent no-candidate/same-identity response is retried');
    calls = []; responses = [JSON.stringify({ ...valid, replacement_quote: 'An invented transition', scope: 'different' }), JSON.stringify(valid)];
    assert.equal((await evaluateWithModel(memory, candidates)).relation, 'equivalent');
    assert.equal(calls.length, 2, 'Ungrounded replacement evidence is retried, including an apparent nonmatch');
    calls = []; responses = [JSON.stringify({ ...valid, scope: 'different' })];
    assert.equal((await evaluateWithModel(memory, candidates)).relation, 'distinct');
    assert.equal(calls.length, 1, 'A valid nonmatch is not retried to chase agreement');
    calls = []; responses = [JSON.stringify({ ...valid, confidence: 0.2 })];
    await evaluateWithModel(memory, candidates);
    assert.equal(calls.length, 1, 'Low confidence is not a format error');
    const controller = new AbortController(); controller.abort(new Error('Cancelled fixture'));
    calls = []; responses = [JSON.stringify(valid)];
    await assert.rejects(evaluateWithModel(memory, candidates, { signal: controller.signal }), /Cancelled fixture/);
    assert.equal(calls.length, 1, 'Transport cancellation must propagate without retry');
    console.log('memoryComparisonRetry.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
