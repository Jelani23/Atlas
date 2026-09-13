const assert = require('assert');
const {
    getReasoningOptions,
    needsSynthesis,
    ReasoningPolicies
} = require('../src/reasoning/controller');

const conversation = getReasoningOptions({ intent: 'conversation' });
assert.strictEqual(conversation.policy, ReasoningPolicies.NONE);
assert.strictEqual(conversation.think, true);
assert.strictEqual(conversation.format, undefined);
assert(conversation.maxTokens >= 1800);

const search = getReasoningOptions({ intent: 'search' });
assert.strictEqual(search.policy, ReasoningPolicies.LIGHT);
assert.strictEqual(search.think, true);
assert(search.maxTokens >= 2400);

const memory = getReasoningOptions({ intent: 'memory' });
assert.strictEqual(memory.policy, ReasoningPolicies.LIGHT);
assert.strictEqual(memory.think, true);

const explanation = getReasoningOptions(
    { intent: 'conversation' },
    null,
    'Explain the difference between working memory and project memory.'
);
assert.strictEqual(explanation.policy, ReasoningPolicies.LIGHT);
assert.strictEqual(explanation.think, true);
assert.strictEqual(needsSynthesis('What is our current test subject?'), false);
assert.strictEqual(needsSynthesis('Briefly explain our raw-chat recall decision.'), true);

const coding = getReasoningOptions({ intent: 'coding' });
assert.strictEqual(coding.policy, ReasoningPolicies.DEEP);
assert.strictEqual(coding.think, true);
assert(coding.maxTokens >= 4096);

for (const intent of ['conversation', 'search', 'memory', 'planning', 'coding']) {
    const modern = getReasoningOptions({ intent }, null, '', 'qwen3.5:4b');
    assert.strictEqual(modern.think, false, 'Validated Qwen 3.5 must not exhaust the reply budget on native reasoning');
    assert.strictEqual(modern.format, undefined, 'Conversational replies remain free text');
    assert.strictEqual(getReasoningOptions({ intent }, null, '', 'qwen3:4b').think, true);
    assert.strictEqual(getReasoningOptions({ intent }, null, '', 'unvalidated-model').think, true);
}
console.log('✓ thinking mode follows the validated model contract');
console.log('✓ shared thinking/content budgets leave room for a completed answer');
console.log('✓ synthesis and coding still receive higher reasoning tiers');
