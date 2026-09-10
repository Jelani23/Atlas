const assert = require('node:assert/strict');
const { equivalenceRisk } = require('../src/memory/memoryEquivalencePolicy');
const { validateDecision } = require('../src/memory/memoryCanonicalizer');

const base = { category: 'knowledge', subject: 'sample', key: 'property' };
const decision = { candidate_index: 0, relation: 'equivalent', confidence: 0.99 };
for (const [left, right] of [
    ['Supports offline mode', 'Does not support offline mode'],
    ['Retention is 30 days', 'Retention is 90 days'],
    ['10 MB', '10 Mb'], ['-5 C', '5 C'],
    ['Linux only', 'Linux and Windows']
]) {
    const incoming = { ...base, value: left };
    const row = { ...base, category: 'technology', value: right };
    assert.ok(equivalenceRisk(incoming, row));
    assert.equal(validateDecision(decision, [row], incoming).matched, false);
}
assert.equal(equivalenceRisk({ value: 'Limit: 10MB' }, { value: 'The limit is 10 MB' }), null);
assert.equal(equivalenceRisk({ value: 'Uses SQLite' }, { value: 'Data is stored in SQLite' }), null);
assert.ok(equivalenceRisk({ category: 'procedure', trigger: 'Fails' }, { trigger: 'Succeeds' }));
for (const relation of ['equivalent', 'conflict', 'update']) {
    assert.equal(validateDecision({ ...decision, relation }, [{ ...base, category: 'procedure', trigger: 'Succeeds' }],
        { ...base, category: 'procedure', trigger: 'Fails' }).matched, false);
}
assert.equal(validateDecision(decision, [{ ...base, category: 'technology', subject: 'model_8b', value: '8 billion' }],
    { ...base, subject: 'model', value: '8 billion' }).matched, false);
console.log('memoryEquivalencePolicy.test.js passed');
