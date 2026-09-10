const assert = require('node:assert/strict');
const { comparisonToDecision, buildComparisonPrompt } = require('../src/memory/memoryIdentityComparison');
const memory = { value: 'It now uses B, replacing A' };
const candidates = [{ value: 'It uses A' }];
const comparison = { candidate_index: 0, entity: 'same', property: 'same', scope: 'same', values: 'incompatible', replacement_quote: '', confidence: 0.97, reason: 'Same property, changed answer' };
const decide = changes => comparisonToDecision({ ...comparison, ...changes }, memory, candidates);
assert.equal(decide({}).relation, 'conflict');
assert.equal(decide({ values: 'equivalent' }).relation, 'equivalent');
assert.equal(decide({ replacement_quote: 'now uses B, replacing A' }).relation, 'update');
assert.equal(decide({ replacement_quote: 'Invented evidence' }).relation, 'distinct');
for (const field of ['entity', 'property', 'scope']) {
    assert.equal(decide({ [field]: 'different' }).relation, 'distinct');
    assert.equal(decide({ [field]: 'uncertain' }).relation, 'distinct');
}
for (const invalid of [{ candidate_index: null }, { confidence: '0.97' }, { values: 'same' }, { replacement_quote: null }]) {
    assert.equal(decide(invalid).confidence, 0);
}
const longValue = 'x'.repeat(350) + ' IMPORTANT NEGATION';
assert.ok(buildComparisonPrompt(memory, [{ value: longValue }]).includes('IMPORTANT NEGATION'), 'Do not silently truncate decisive evidence');
const prompt = buildComparisonPrompt({ category: 'knowledge', subject: 'sample_server', key: 'access_mode' }, [
    { category: 'technology', subject: 'sample_server', key: 'access_support' }
]);
assert.ok(prompt.includes('sample server'));
assert.ok(prompt.includes('access mode'));
assert.ok(!prompt.includes('"category":"technology"'), 'Storage categories must not masquerade as entity differences');
assert.equal(decide({ values: 'uncertain' }).relation, 'distinct');
console.log('memoryIdentityComparison.test.js passed');
