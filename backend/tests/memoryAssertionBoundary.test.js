const assert = require('node:assert/strict');
const { validateAssertion, buildAssertionPrompt, assertionBoundary } = require('../src/memory/memoryAssertionBoundary');
for (const mode of ['asserted', 'required', 'proposed', 'hypothetical']) {
    assert.equal(validateAssertion({ incoming: mode, stored: mode, reason: 'Same mode' }), true);
    for (const other of ['asserted', 'required', 'proposed', 'hypothetical'].filter(value => value !== mode)) {
        assert.equal(validateAssertion({ incoming: mode, stored: other, reason: 'Different' }), false);
    }
}
for (const invalid of [null, {}, { incoming: 'uncertain', stored: 'uncertain', reason: '' },
    { incoming: 'asserted', stored: 'asserted' }, { incoming: 'unknown', stored: 'unknown', reason: '' }]) {
    assert.equal(validateAssertion(invalid), false);
}
const prompt = buildAssertionPrompt({ key: 'requirement', value: 'Should retain logs' }, { key: 'runtime', value: 'Retains no logs' });
assert.equal(assertionBoundary(null), 'invalid');
assert.equal(assertionBoundary({ incoming: 'uncertain', stored: 'asserted', reason: '' }), 'uncertain');
assert.equal(assertionBoundary({ incoming: 'required', stored: 'asserted', reason: '' }), 'different');
assert.ok(prompt.includes('Should retain logs'));
assert.ok(prompt.includes('Retains no logs'));
console.log('memoryAssertionBoundary.test.js passed');
