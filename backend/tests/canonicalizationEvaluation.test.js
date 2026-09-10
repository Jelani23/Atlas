const assert = require('node:assert/strict');
const { evaluateCases } = require('../src/memory/canonicalizationEvaluation');
const fixtures = require('./fixtures/canonicalizationCases');

async function run() {
    const exact = structuredClone(fixtures.find(test => test.id === 'exact_duplicate'));
    const paraphrase = structuredClone(fixtures.find(test => test.id === 'paraphrase'));
    const before = JSON.stringify([exact, paraphrase]);
    const result = await evaluateCases([exact, paraphrase], {
        evaluate: async () => ({ candidate_index: 0, relation: 'equivalent', confidence: 0.99, reason: 'Fixture classifier' })
    });
    assert.equal(result.summary.passed, 2);
    assert.equal(result.summary.modelCalls, 1);
    assert.equal(JSON.stringify([exact, paraphrase]), before, 'fixtures must not be mutated');

    const unsafe = await evaluateCases([{ ...paraphrase, expected: { relation: 'distinct', matchedId: null } }], {
        evaluate: async () => ({ candidate_index: 0, relation: 'equivalent', confidence: 0.99, reason: 'Deliberately wrong' })
    });
    assert.equal(unsafe.summary.unsafeMatches, 1);
    assert.equal(unsafe.summary.passed, 0);

    const unavailable = await evaluateCases([paraphrase], {
        evaluate: async () => { throw new Error('Offline fixture'); }
    });
    assert.equal(unavailable.summary.errors, 1);
    assert.equal(unavailable.summary.passed, 0);

    const missing = await evaluateCases([{ ...paraphrase, rows: [] }], {
        evaluate: async () => { throw new Error('Must not run'); }
    });
    assert.equal(missing.summary.candidateMisses, 1);
    assert.equal(missing.summary.modelCalls, 0);
    await assert.rejects(() => evaluateCases([{ ...paraphrase, rows: undefined }]), /database loading is forbidden/);
    console.log('canonicalizationEvaluation.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
