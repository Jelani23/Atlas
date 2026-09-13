const assert = require('node:assert/strict');
const routerPath = require.resolve('../src/models/modelRouter');
const { buildRequestBody } = require('../src/models/providers/ollama');
const keys = ['OLLAMA_MODEL', 'OLLAMA_MODEL_GENERAL', 'OLLAMA_MODEL_CODER'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const router = () => { delete require.cache[routerPath]; return require(routerPath); };
try {
    for (const key of keys) delete process.env[key];
    assert.equal(router().getDefaultModel().model, 'qwen3.5:4b');
    assert.equal(buildRequestBody([], {}).model, 'qwen3.5:4b');
    assert.equal(router().getModelForTask('generate_code').model, 'qwen2.5-coder:7b');
    process.env.OLLAMA_MODEL = 'shared-fixture';
    assert.equal(router().getDefaultModel().model, 'shared-fixture', 'Shared configuration must reach conversation routing');
    assert.equal(router().getModelForTask('search_web').model, 'shared-fixture');
    assert.equal(buildRequestBody([], {}).model, 'shared-fixture');
    process.env.OLLAMA_MODEL_GENERAL = 'general-fixture';
    process.env.OLLAMA_MODEL_CODER = 'coder-fixture';
    assert.equal(router().getDefaultModel().model, 'general-fixture');
    assert.equal(router().getModelForTask('generate_code').model, 'coder-fixture');
    assert.equal(buildRequestBody([], { model: 'explicit-fixture' }).model, 'explicit-fixture');
    console.log('modelRouting.test.js passed');
} finally {
    for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    }
    delete require.cache[routerPath];
}
