const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';

const planner = require('../src/planner/planner');
const { resolve } = require('../src/intent/intentResolver');

async function run() {
    const message = 'Calculate 2 + 2 and then word count of hello world';
    const result = await planner.route(resolve(message), message);
    assert.strictEqual(result.toolName, 'multi_tool');
    assert.deepStrictEqual(result.toolNames, ['calculate', 'wordCount']);
    assert.strictEqual(result.shortCircuit, true);
    assert(result.toolResult.includes('The result of 2 + 2 is 4'));
    assert(result.toolResult.includes('Word count: 2'));

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
