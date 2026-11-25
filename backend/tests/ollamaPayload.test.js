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
async function metadata(){
    const provider=require('../src/models/providers/ollama');
    const old=global.fetch;
    const envelope={done:true,done_reason:'length',message:{role:'assistant',content:'partial',thinking:'native'}};
    try{
        global.fetch=async()=>({ok:true,json:async()=>envelope});
        assert.deepStrictEqual(await provider.completeEnvelope(messages),envelope);
        assert.strictEqual(await provider.complete(messages),'partial','Existing callers keep the string-return API.');
    }finally{global.fetch=old;}
}
metadata().catch(error=>{console.error(error);process.exitCode=1;});
