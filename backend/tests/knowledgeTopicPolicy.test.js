const assert = require('assert');
const { assessKnowledgeTopics, groundedKnowledgeTopics } = require('../src/memory/knowledgeTopicPolicy');

const darkMode = {
    subject: 'ollama_release', key: 'dark_mode_support_restored',
    value: 'Restored dark mode support across operating systems',
    topics: ['dark_mode', 'macos', 'macos_compatibility', 'ollama', 'qwen_3_8_27b', 'release'],
    source: 'https://example.com/macos/qwen',
    category: 'macos'
};
assert.deepStrictEqual(groundedKnowledgeTopics(darkMode), ['dark_mode', 'ollama', 'release']);
assert.strictEqual(assessKnowledgeTopics(darkMode).review.length, 3);
assert.deepStrictEqual(groundedKnowledgeTopics({
    subject: 'Qwen3.8-27B', key: 'model_name', value: 'Qwen3.8-27B',
    topics: ['qwen3_8', 'qwen_3_9', 'qwen_3_8_72b', 'qwen_3_8_27b']
}), ['qwen3_8', 'qwen_3_8_27b']);
assert.deepStrictEqual(groundedKnowledgeTopics({
    subject: 'renderer', key: 'theme', value: 'Follows system appearance', topics: ['dark_mode']
}), [], 'Possible synonyms remain review candidates without direct support.');

const writes = [];
const clientPath = require.resolve('../src/database/supabaseClient');
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: {
    rpc: async (_name, args) => { writes.push(args.p_candidate); return { data: { action: 'refreshed', record_id: 1 }, error: null }; },
    from: () => ({
        insert: async row => { writes.push(row); return { error: null }; },
        upsert: async row => { writes.push(row); return { error: null }; }
    })
} };
const library = require('../src/memory/knowledgeLibrary');
async function run() {
    await library.addKnowledge(darkMode);
    await library.upsertKnowledge(darkMode);
    for (const row of writes) {
        assert.deepStrictEqual(row.topics, ['dark_mode', 'ollama', 'release']);
        assert.strictEqual(row.value, darkMode.value);
    }
    assert.strictEqual(writes[0].verification_status, 'unverified');
    assert.strictEqual(writes[1].verification_status, undefined, 'Metadata filtering must not reset preserved verification.');
    console.log('knowledgeTopicPolicy.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
