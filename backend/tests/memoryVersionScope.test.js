const assert = require('node:assert/strict');
const { resolveMemory } = require('../src/memory/memoryCanonicalizer');
const cases = require('./fixtures/canonicalizationChallengeCases');
async function run() {
    const selected = cases.filter(test => ['challenge_historical_versions', 'challenge_versions_in_different_properties',
        'challenge_procedure_versions', 'challenge_explicit_version_update', 'challenge_exact_among_conflicts'].includes(test.id));
    for (const test of selected) {
        let calls = 0;
        const result = await resolveMemory(test.incoming, { rows: test.rows, evaluate: async () => {
            calls++;
            return { candidate_index: 0, relation: test.expected.relation, confidence: 0.99, reason: 'Fixture comparison' };
        } });
        assert.equal(result.relation, test.expected.relation, test.id);
        assert.equal(result.existing?.id ?? null, test.expected.matchedId, test.id);
        assert.equal(calls, test.expected.relation === 'equivalent' ? 0 : 1, 'Only exact duplicates may bypass comparison');
    }
    console.log('memoryVersionScope.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
