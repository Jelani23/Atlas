const assert = require('assert');

const { getKnowledgeSearchTerms, getKnowledgeAnchorTerms } = require('../src/memory/knowledgeRelevance');
const { resolveTrustedKnowledgeBoundaryReply } = require('../src/utils/turnGrounding');

const query = 'Without searching the web, what does your internal trusted knowledge say are the latest Qwen models?';
const terms = getKnowledgeSearchTerms(query);
assert.deepStrictEqual(getKnowledgeAnchorTerms(terms), ['qwen']);

const reply = resolveTrustedKnowledgeBoundaryReply(query, {
    knowledge: [
        { id: 42, subject: 'qwen3_27b_models', key: 'model_name', value: 'Qwen3.8-27B' },
        { id: 77, subject: 'qwen_max_model_family', key: 'parameter_count', value: '2.4 trillion parameters' }
    ],
    quarantinedKnowledge: []
});
assert(reply.includes('Qwen3.8-27B'));
assert(reply.includes('2.4 trillion parameters'));
assert(!reply.includes('Qwen3 4B'));

console.log('trustedKnowledgeGrounding.test.js: all assertions passed');
