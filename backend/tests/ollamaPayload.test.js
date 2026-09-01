const assert = require('assert');
const { buildRequestBody } = require('../src/models/providers/ollama');

const schema = {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer']
};
const messages = [{ role: 'user', content: 'Hello' }];

const streaming = buildRequestBody(messages, {
    model: 'qwen3:4b',
    think: false,
    maxTokens: 700,
    format: schema
}, true);

assert.strictEqual(streaming.stream, true);
assert.strictEqual(streaming.think, false);
assert.strictEqual(streaming.options.num_predict, 700);
assert.strictEqual(streaming.format, schema);

const regular = buildRequestBody(messages, { format: schema }, false);
assert.strictEqual(regular.stream, false);
assert.strictEqual(regular.format, schema);

console.log('✓ structured format is forwarded by streaming and complete Ollama requests');
