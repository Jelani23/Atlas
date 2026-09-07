const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

function installFake(relativePath, exportsObject) {
    const resolved = require.resolve(relativePath);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: exportsObject
    };
}

const canonicalRow = {
    id: 77,
    category: 'technology',
    subject: 'qwen_3_8_max',
    topics: ['qwen', 'latest_release'],
    type: 'fact',
    key: 'parameter_count',
    value: '2.4 trillion parameters',
    verification_status: 'verified'
};

const writes = [];
const fakeKnowledge = {
    async find(category, subject, key) {
        if (
            category === canonicalRow.category &&
            subject === canonicalRow.subject &&
            key === canonicalRow.key
        ) return canonicalRow;
        return null;
    },
    async upsertKnowledge(row, options) {
        writes.push({ row, options });
        return true;
    }
};

installFake('../src/memory/knowledgeLibrary', fakeKnowledge);
installFake('../src/memory/memoryCanonicalizer', {
    async resolveMemory(memory) {
        return {
            matched: true,
            relation: 'equivalent',
            confidence: 0.98,
            reason: 'Same model property.',
            existing: canonicalRow,
            memory: {
                ...memory,
                knowledge_category: canonicalRow.category,
                subject: canonicalRow.subject,
                key: canonicalRow.key
            }
        };
    }
});
installFake('../src/memory/projectRegistry', {
    async getAllProjects() { return []; }
});

const memoryManager = require('../src/memory/memoryManager');

async function run() {
    const result = await memoryManager.handleMemoryAction({
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'qwen_max_model_family',
        topics: ['parameters'],
        type: 'fact',
        key: 'parameter_total',
        value: 'The model has 2.4 trillion parameters.',
        source: 'https://example.com/qwen',
        source_type: 'web_search'
    });

    assert.strictEqual(result.action, 'duplicate');
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].row.subject, canonicalRow.subject);
    assert.strictEqual(writes[0].row.key, canonicalRow.key);
    assert.strictEqual(writes[0].row.value, canonicalRow.value);
    assert.deepStrictEqual(writes[0].row.topics, ['qwen', 'parameters']);
    assert.strictEqual(writes[0].options.preserveVerification, true);

    console.log('memoryCanonicalizationManager.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
