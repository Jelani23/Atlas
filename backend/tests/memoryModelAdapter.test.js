const assert = require('node:assert/strict');
const adapterPath = require.resolve('../src/models/modelAdapter');
const calls = [];
const complete = async (messages, options) => { calls.push({ messages, options }); return 'fixture'; };
const ordinary = { complete, streamComplete: () => {} };
require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true,
    exports: { createModelAdapter: () => ordinary } };
const { createMemoryModelAdapter } = require('../src/models/memoryModelAdapter');

async function run() {
    const before = process.env.OLLAMA_MODEL_MEMORY;
    try {
        delete process.env.OLLAMA_MODEL_MEMORY;
        const memory = createMemoryModelAdapter('ollama');
        const options = { temperature: 0, format: { type: 'object' }, signal: new AbortController().signal };
        await memory.complete([], options);
        assert.equal(calls.at(-1).options, options, 'Unset override preserves provider defaults and request identity');
        process.env.OLLAMA_MODEL_MEMORY = ' qwen3.5:4b ';
        await memory.complete([], options);
        assert.equal(calls.at(-1).options.model, 'qwen3.5:4b');
        assert.equal(calls.at(-1).options.signal, options.signal);
        assert.equal(calls.at(-1).options.format, options.format);
        assert.equal(options.model, undefined, 'The caller options must not be mutated');
        await memory.complete([], { ...options, model: 'explicit-fixture' });
        assert.equal(calls.at(-1).options.model, 'explicit-fixture', 'An explicit per-call model wins');
        await createMemoryModelAdapter('other-provider').complete([], options);
        assert.equal(calls.at(-1).options, options, 'An Ollama model name must never leak to another provider');
        assert.equal(ordinary.complete, complete, 'The shared conversational adapter must remain unchanged');
        assert.equal(memory.streamComplete, ordinary.streamComplete);
        console.log('memoryModelAdapter.test.js passed');
    } finally {
        if (before === undefined) delete process.env.OLLAMA_MODEL_MEMORY;
        else process.env.OLLAMA_MODEL_MEMORY = before;
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
