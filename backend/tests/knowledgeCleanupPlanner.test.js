const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

const {
    buildCleanupProposals,
    chooseSurvivor,
    qualityScore
} = require('../src/memory/knowledgeCleanupPlanner');

const verified = {
    id: 10,
    verification_status: 'verified',
    verification_method: 'manual',
    verification_sources: [{ url: 'https://example.com/release' }],
    last_verified_at: '2026-09-02T00:00:00Z',
    confidence: 0.95
};
const provisional = {
    id: 11,
    verification_status: 'needs_source',
    verification_sources: [],
    confidence: 0.8
};

assert.ok(qualityScore(verified) > qualityScore(provisional));
assert.deepStrictEqual(chooseSurvivor(verified, provisional).survivor_id, 10);

const tied = chooseSurvivor(
    { ...provisional, id: 12 },
    { ...provisional, id: 13 }
);
assert.strictEqual(tied.decision, 'review');

const conflict = buildCleanupProposals(
    [verified, provisional],
    [{ incoming_id: 10, matched_id: 11, relation: 'conflict', confidence: 1, reason: 'Different versions.' }]
)[0];
assert.strictEqual(conflict.action, 'preserve_both');
assert.strictEqual(conflict.recommendation, null);

const equivalent = buildCleanupProposals(
    [verified, provisional],
    [{ incoming_id: 10, matched_id: 11, relation: 'equivalent', confidence: 1, reason: 'Same claim.' }]
)[0];
assert.strictEqual(equivalent.action, 'supersede_redundant');
assert.strictEqual(equivalent.recommendation.survivor_id, 10);

const chained = buildCleanupProposals(
    [verified, provisional, { ...provisional, id: 12 }],
    [
        { incoming_id: 10, matched_id: 11, relation: 'equivalent', confidence: 1, reason: 'Same claim.' },
        { incoming_id: 11, matched_id: 12, relation: 'equivalent', confidence: 1, reason: 'Same claim.' }
    ]
);
assert.strictEqual(chained.length, 1);
assert.strictEqual(chained[0].records.length, 3);
assert.strictEqual(chained[0].recommendation.survivor_id, 10);
assert.deepStrictEqual(chained[0].recommendation.redundant_ids.sort(), [11, 12]);

console.log('knowledgeCleanupPlanner.test.js passed');
