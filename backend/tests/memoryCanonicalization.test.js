const assert = require('assert');
const canonicalizer = require('../src/memory/memoryCanonicalizer');
const deduplicator = require('../src/memory/memoryDeduplicator');
const {
    buildCanonicalizationAudit,
    buildSemanticCanonicalizationAudit
} = require('../src/memory/memoryCanonicalizationAudit');

const existing = {
    id: 77,
    category: 'technology',
    subject: 'qwen_3_8_max',
    topics: ['qwen', 'model_family', 'latest_release'],
    key: 'parameter_count',
    value: '2.4 trillion parameters',
    source: 'https://example.com/qwen',
    verification_status: 'verified'
};

const incoming = {
    category: 'knowledge',
    knowledge_category: 'technology',
    subject: 'qwen_3_8_max_model_family',
    topics: ['qwen_models', 'parameters'],
    key: 'parameter_total',
    value: 'The model has 2.4 trillion parameters.'
};

async function run() {
    const candidates = canonicalizer.selectCandidates(incoming, [existing]);
    assert.strictEqual(candidates.length, 1, 'related semantic identities should reach adjudication');

    const equivalent = await canonicalizer.resolveMemory(incoming, {
        rows: [existing],
        evaluate: async () => ({
            candidate_index: 0,
            relation: 'equivalent',
            confidence: 0.97,
            reason: 'Same model property and value.'
        })
    });

    assert.strictEqual(equivalent.matched, true);
    assert.strictEqual(equivalent.memory.subject, 'qwen_3_8_max');
    assert.strictEqual(equivalent.memory.key, 'parameter_count');
    assert.strictEqual(equivalent.memory.knowledge_category, 'technology');

    const duplicate = deduplicator.determineAction(
        equivalent.memory,
        existing,
        equivalent
    );
    assert.strictEqual(duplicate.action, 'duplicate');

    const conflictResolution = {
        ...equivalent,
        relation: 'conflict'
    };
    const conflict = deduplicator.determineAction(
        equivalent.memory,
        existing,
        conflictResolution
    );
    assert.strictEqual(conflict.action, 'conflict');

    const lowConfidence = await canonicalizer.resolveMemory(incoming, {
        rows: [existing],
        evaluate: async () => ({
            candidate_index: 0,
            relation: 'equivalent',
            confidence: 0.72,
            reason: 'Possibly the same.'
        })
    });
    assert.strictEqual(lowConfidence.matched, false, 'uncertain matches must fail closed');
    assert.strictEqual(lowConfidence.memory.subject, incoming.subject);

    let evaluatorCalled = false;
    const deterministicEquivalent = await canonicalizer.resolveMemory({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'ollama_release',
        topics: ['ollama', 'release', 'qwen'],
        key: 'qwen_3_8_27b_model_added',
        value: 'Added Qwen 3.8 27B model support'
    }, {
        rows: [{
            id: 72,
            category: 'technology',
            subject: 'ollama_release',
            topics: ['ollama', 'release'],
            key: 'qwen_3_8_27b_model_added',
            value: 'Added Qwen 3.8 27B model support'
        }],
        evaluate: async () => {
            evaluatorCalled = true;
            return { candidate_index: 0, relation: 'equivalent', confidence: 0.97, reason: 'Same full claim after semantic review.' };
        }
    });
    assert.strictEqual(deterministicEquivalent.matched, true);
    assert.strictEqual(deterministicEquivalent.relation, 'equivalent');
    assert.strictEqual(evaluatorCalled, false, 'exact anchored duplicates should not spend a model call');

    evaluatorCalled = false;
    const anchoredParaphrase = await canonicalizer.resolveMemory({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'ollama_release',
        topics: ['ollama', 'dark_mode'],
        key: 'dark_mode_support_restored',
        value: 'Restored dark mode support across operating systems'
    }, {
        rows: [{
            id: 67,
            category: 'technology',
            subject: 'ollama_release',
            topics: ['ollama', 'macos', 'dark_mode'],
            key: 'dark_mode_restored',
            value: "Ollama's app follows system appearance again, restoring dark mode support"
        }],
        evaluate: async () => {
            evaluatorCalled = true;
            return { candidate_index: 0, relation: 'equivalent', confidence: 0.97, reason: 'Same full claim after semantic review.' };
        }
    });
    assert.strictEqual(anchoredParaphrase.matched, true);
    assert.strictEqual(anchoredParaphrase.relation, 'equivalent');
    assert.strictEqual(evaluatorCalled, true, 'paraphrases require semantic review rather than word overlap');

    evaluatorCalled = false;
    const labelAgnosticEquivalent = await canonicalizer.resolveMemory({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'ollama_version',
        topics: ['ollama'],
        key: 'important_changes',
        value: "Ollama's app follows the system appearance again, restoring dark mode support"
    }, {
        rows: [{
            id: 74,
            category: 'technology',
            subject: 'ollama_release',
            topics: ['ollama'],
            key: 'dark_mode_support_restored',
            value: 'Restored dark mode support across operating systems'
        }],
        evaluate: async () => {
            evaluatorCalled = true;
            return { candidate_index: 0, relation: 'equivalent', confidence: 0.97, reason: 'Same full claim after semantic review.' };
        }
    });
    assert.strictEqual(labelAgnosticEquivalent.relation, 'equivalent');
    assert.strictEqual(labelAgnosticEquivalent.existing.id, 74);
    assert.strictEqual(evaluatorCalled, true, 'storage-label variants require semantic review');

    evaluatorCalled = false;
    const differentModelVariant = await canonicalizer.resolveMemory({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'Qwen 3.8 27B',
        key: 'capabilities',
        value: 'coding, research, and long-horizon agentic tasks'
    }, {
        rows: [{
            id: 79,
            category: 'technology',
            subject: 'qwen_3_8_max',
            key: 'capabilities',
            value: 'coding, research, and long-horizon agentic tasks'
        }],
        evaluate: async () => {
            evaluatorCalled = true;
            return { candidate_index: -1, relation: 'distinct', confidence: 1, reason: 'Different model variants.' };
        }
    });
    assert.strictEqual(differentModelVariant.relation, 'distinct');
    assert.strictEqual(evaluatorCalled, true, 'different model qualifiers must not auto-merge');

    const versionGuard = canonicalizer.validateDecision({
        candidate_index: 0,
        relation: 'equivalent',
        confidence: 0.96,
        reason: 'Minor version difference.'
    }, [{ value: 'v0.33.2' }], { value: 'v0.33.1' });
    assert.strictEqual(versionGuard.matched, true);
    assert.strictEqual(versionGuard.relation, 'conflict', 'different versions cannot be equivalent');

    evaluatorCalled = false;
    const reviewedVersionConflict = await canonicalizer.resolveMemory({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'ollama_release',
        key: 'latest_stable_version',
        value: 'v0.33.1'
    }, {
        rows: [{
            id: 64,
            category: 'technology',
            subject: 'ollama_version',
            key: 'latest_stable_version',
            value: 'v0.33.2',
            verification_status: 'unverified'
        }],
        evaluate: async () => {
            evaluatorCalled = true;
            return { candidate_index: -1, relation: 'distinct', confidence: 1, reason: '' };
        }
    });
    assert.strictEqual(reviewedVersionConflict.relation, 'distinct');
    assert.strictEqual(evaluatorCalled, true, 'different versions must still establish semantic identity and scope');

    const compositeGuard = canonicalizer.validateDecision({
        candidate_index: 0,
        relation: 'equivalent',
        confidence: 0.96,
        reason: 'Overlapping content.'
    }, [{ key: 'dark_mode_restored', value: 'Dark mode was restored.' }], {
        key: 'important_changes',
        value: 'Dark mode was restored; macOS handoff was fixed.'
    });
    assert.strictEqual(compositeGuard.matched, false, 'a summary must not collapse into one component claim');

    const differentProject = canonicalizer.selectCandidates({
        category: 'project',
        project_key: 'atlas',
        subject: 'memory',
        key: 'storage_backend',
        value: 'Supabase'
    }, [{
        id: 2,
        project_key: 'another_project',
        subject: 'memory',
        key: 'storage_backend',
        value: 'Supabase'
    }]);
    assert.strictEqual(differentProject.length, 0, 'project boundaries must never be crossed');

    const audit = buildCanonicalizationAudit('knowledge', [
        existing,
        {
            id: 78,
            category: 'technology',
            subject: 'qwen_3_8_max_model_family',
            topics: [],
            key: 'parameter_total',
            value: 'The model has 2.4 trillion parameters.',
            source: null,
            verification_status: null
        }
    ]);
    assert.strictEqual(audit.summary.potential_semantic_matches, 1);
    assert.strictEqual(audit.summary.legacy_records, 1);
    assert.ok(audit.summary.issues.missing_provenance >= 1);

    const semanticAudit = await buildSemanticCanonicalizationAudit(
        'knowledge',
        [
            {
                ...existing,
                id: 77
            },
            {
                id: 78,
                category: 'technology',
                subject: 'qwen_3_8_max_model_family',
                topics: ['qwen_models', 'parameters'],
                key: 'parameter_total',
                value: 'The model has 2.4 trillion parameters.'
            }
        ],
        {
            evaluate: async () => ({
                candidate_index: 0,
                relation: 'equivalent',
                confidence: 0.98,
                reason: 'Same claim.'
            })
        }
    );
    assert.strictEqual(semanticAudit.summary.high_confidence_suggestions, 1);
    assert.strictEqual(semanticAudit.semantic_suggestions[0].action, 'review_merge_direction');

    console.log('memoryCanonicalization.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
