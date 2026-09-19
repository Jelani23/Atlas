const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';

const planner = require('../src/planner/planner');
const { resolve } = require('../src/intent/intentResolver');
const { formatImmediateToolReply } = require('../src/response/toolResultPresenter');

async function run() {
    const background = require('../src/planner/routing/backgroundRouter');
    const originalTask = background.handleTask;
    try {
        background.handleTask = async (task, message) => {
            assert.equal(task.intent,'analyze_and_suggest');
            assert.equal(task.filename,'src/core/sourceReader.js');
            assert.equal(message,'Analyze and test code for src/core/sourceReader.js');
            return 'controlled-analysis-started';
        };
        const request = 'Analyze and test code for src/core/sourceReader.js';
        const started = await planner.route(resolve(request),request);
        assert.equal(started.toolResult,'controlled-analysis-started');
        assert.equal(started.shortCircuit,true);
    } finally { background.handleTask = originalTask; }
    const rangeMessage = 'Read the code for src/core/contextManager.js lines 2-4';
    const ranged = await planner.route(resolve(rangeMessage), rangeMessage);
    assert.strictEqual(ranged.toolName, 'readCode');
    assert(ranged.toolResult.includes('"startLine":2,"endLine":4'));
    const state = require('../src/planner/state');
    state.codeEvidence = require('../src/core/codeEvidence').capture(ranged, 'alice');
    const next = await planner.route(resolve('Read the next page'), 'Read the next page');
    assert(next.toolResult.includes('"startLine":5'));
    state.codeEvidence = null;
    const missing = await planner.route(resolve('Read the next page'), 'Read the next page');
    assert(missing.toolResult.includes('No current, unambiguous'));
    const multiple = await require('../src/tools/toolExecutor').execute('readCode', [['src/core/sourceReader.js', 'src/tools/files/readCode.js']]);
    assert(multiple.includes('Content of src/core/sourceReader.js:'));
    assert(multiple.includes('Content of src/tools/files/readCode.js:'));

    const message = 'Calculate 2 + 2 and then word count of hello world';
    const result = await planner.route(resolve(message), message);
    assert.strictEqual(result.toolName, 'multi_tool');
    assert.deepStrictEqual(result.toolNames, ['calculate', 'wordCount']);
    assert.strictEqual(result.shortCircuit, true);
    assert(result.toolResult.includes('The result of 2 + 2 is 4'));
    assert(result.toolResult.includes('Word count: 2'));
    assert.strictEqual(formatImmediateToolReply(result), 'Here you go. 2 + 2 is 4. “hello world” has 2 words.');

    const blockedMessage = 'Find the file package.json and then read it';
    const blocked = await planner.route(resolve(blockedMessage), blockedMessage);
    assert.strictEqual(blocked.toolName, 'ask_clarification');
    assert.strictEqual(blocked.shortCircuit, true);

    console.log('plannerMultiToolRouting.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
