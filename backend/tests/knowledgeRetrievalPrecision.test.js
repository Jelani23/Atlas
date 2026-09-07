const assert = require('assert');
const {
    getKnowledgeSearchTerms,
    getKnowledgeAnchorTerms,
    isKnowledgeRowRelevant
} = require('../src/memory/knowledgeRelevance');

function relevant(query, row) {
    const terms = getKnowledgeSearchTerms(query);
    return isKnowledgeRowRelevant(row, terms, getKnowledgeAnchorTerms(terms));
}

const darkMode = {
    subject: 'ollama_release',
    key: 'dark_mode_support_restored',
    value: 'Restored dark mode support across operating systems',
    topics: ['ollama', 'dark_mode']
};
const qwenSupport = {
    subject: 'ollama_release',
    key: 'qwen_3_8_27b_model_added',
    value: 'Added Qwen 3.8 27B model support',
    topics: ['ollama', 'qwen', 'dark_mode', 'macos_compatibility']
};
const macosFix = {
    subject: 'ollama_release',
    key: 'macos_instance_handling_fixed',
    value: 'Fixed macOS app to properly handle existing instances',
    topics: ['ollama', 'macos', 'dark_mode', 'qwen_3_8_27b']
};
const releaseVersion = {
    subject: 'ollama_release',
    key: 'latest_stable_version',
    value: 'v0.33.1',
    topics: ['ollama', 'release']
};

assert.strictEqual(relevant('Search the knowledge library for Ollama dark mode support', darkMode), true);
assert.strictEqual(relevant('Search the knowledge library for Ollama dark mode support', qwenSupport), false);
assert.strictEqual(relevant('Search the knowledge library for Ollama dark mode support', macosFix), false);

assert.strictEqual(relevant('Search the knowledge library for Ollama Qwen 3.8 27B support', qwenSupport), true);
assert.strictEqual(relevant('Search the knowledge library for Ollama Qwen 3.8 27B support', darkMode), false);

assert.strictEqual(relevant('Search the knowledge library for the latest stable Ollama release', releaseVersion), true);
assert.strictEqual(relevant('Search the knowledge library for the latest stable Ollama release', darkMode), false);
assert.strictEqual(relevant('Search the knowledge library for the latest stable Ollama release', macosFix), false);
assert.strictEqual(relevant('Search the knowledge library for the latest stable Ollama release', qwenSupport), false);

console.log('knowledgeRetrievalPrecision.test.js passed');
