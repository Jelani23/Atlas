const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

const {
    looksComposite,
    validateDecomposition,
    extractStrongClaimSpans,
    calculateSpanCoverage,
    deriveAtomicValue,
    inferRelativeAntecedent,
    deriveComponentTopics,
    isSpecificAtomicKey,
    planAtomicDecomposition
} = require('../src/memory/knowledgeAtomicityPlanner');

const composite = {
    id: 65,
    category: 'technology',
    subject: 'ollama_version',
    key: 'important_changes',
    value: 'Dark mode was restored; macOS handoff was fixed.',
    type: 'fact',
    topics: ['ollama'],
    verification_status: 'unverified'
};

assert.strictEqual(looksComposite(composite), true);
assert.strictEqual(looksComposite({ key: 'release_date', value: 'Released August 2.' }), false);
assert.deepStrictEqual(extractStrongClaimSpans(composite.value), [
    'Dark mode was restored',
    'macOS handoff was fixed.'
]);
assert.ok(calculateSpanCoverage(composite.value, extractStrongClaimSpans(composite.value)) > 0.9);
assert.strictEqual(deriveAtomicValue('which delivers measurable gains.'), 'delivers measurable gains');
assert.strictEqual(inferRelativeAntecedent(
    'Ollama supports Qwen 3.8 27B, which delivers measurable gains.',
    'which delivers measurable gains.'
), 'Qwen 3.8 27B');
assert.deepStrictEqual(deriveComponentTopics({ topics: ['ollama', 'qwen3_8', 'nvidia_nemotron'] }, {
    subject: 'Qwen 3.8 27B',
    source_span: 'which delivers measurable gains'
}), ['qwen3_8']);
assert.strictEqual(isSpecificAtomicKey('capabilities'), true);
assert.strictEqual(isSpecificAtomicKey('delivers'), false);
assert.strictEqual(isSpecificAtomicKey('delivers_substantial_gains'), false);
assert.strictEqual(isSpecificAtomicKey('important_changes'), false);

const decomposition = {
    is_composite: true,
    reason: 'Two independently verifiable changes.',
    components: [
        {
            subject: 'ollama_release',
            key: 'dark_mode_restored',
            value: 'Dark mode was restored.',
            type: 'fact',
            topics: ['ollama', 'dark_mode'],
            source_span: 'Dark mode was restored',
            confidence: 0.98
        },
        {
            subject: 'ollama_release',
            key: 'macos_handoff_fixed',
            value: 'macOS handoff was fixed.',
            type: 'fact',
            topics: ['ollama', 'macos'],
            source_span: 'macOS handoff was fixed',
            confidence: 0.98
        }
    ]
};

assert.strictEqual(validateDecomposition(composite, decomposition).valid, true);
assert.strictEqual(validateDecomposition(composite, {
    ...decomposition,
    components: [{ ...decomposition.components[0], source_span: 'Invented source text' }, decomposition.components[1]]
}).valid, false);
assert.strictEqual(validateDecomposition(composite, {
    ...decomposition,
    components: [
        decomposition.components[0],
        { ...decomposition.components[1], source_span: 'Dark mode was restored' }
    ]
}).valid, false);

async function run() {
    const plan = await planAtomicDecomposition(composite, [{ id: 74 }, { id: 76 }], {
        decompose: async () => decomposition,
        resolve: async memory => ({
            relation: 'equivalent',
            confidence: 0.98,
            reason: 'Same atomic claim.',
            existing: { id: memory.key.includes('dark') ? 74 : 76 }
        })
    });
    assert.strictEqual(plan.status, 'review_ready');
    assert.strictEqual(plan.coverage_complete, true);
    assert.strictEqual(plan.can_supersede_now, false);
    assert.strictEqual(plan.apply_eligible, true);
    assert.match(plan.approval_hash, /^[a-f0-9]{20}$/);
    assert.deepStrictEqual(plan.destination_ids, [74, 76]);
    assert.deepStrictEqual(plan.components.map(component => component.matched_id), [74, 76]);
    assert.deepStrictEqual(plan.components.map(component => component.value), [
        'Dark mode was restored',
        'macOS handoff was fixed'
    ]);
    assert.deepStrictEqual(plan.components[0].topics, composite.topics);
    console.log('knowledgeAtomicityPlanner.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
