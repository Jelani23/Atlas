const assert = require('node:assert/strict');
const { formatImmediateToolReply, presentResult } = require('../src/response/toolResultPresenter');
const { execute: calculate } = require('../src/tools/utilities/calculate');
const { execute: wordCount } = require('../src/tools/utilities/wordCount');
const { execute: convertUnit } = require('../src/tools/utilities/convertUnit');
const { execute: characterCount } = require('../src/tools/utilities/characterCount');

async function run() {
    const first = { toolName: 'multi_tool', toolResults: [
        { toolName: 'calculate', args: ['two plus two'], result: await calculate('two plus two'), status: 'complete' },
        { toolName: 'wordCount', args: ['hello world'], result: await wordCount('hello world'), status: 'complete' }
    ] };
    const snapshot = JSON.stringify(first);
    assert.equal(formatImmediateToolReply(first), 'Here you go. 2 + 2 is 4. “hello world” has 2 words.');
    assert.equal(JSON.stringify(first), snapshot, 'Presentation must not rewrite tool evidence');
    const second = { toolName: 'multi_tool', toolResults: [
        { toolName: 'convertUnit', args: [5, 'kilometers', 'meters'], result: await convertUnit(5, 'kilometers', 'meters'), status: 'complete' },
        { toolName: 'characterCount', args: ['Atlas'], result: await characterCount('Atlas'), status: 'complete' }
    ] };
    assert.equal(formatImmediateToolReply(second), 'Here you go. 5 kilometers comes to 5000 meters. “Atlas” has 5 characters.');
    assert.equal(presentResult({ toolName: 'wordCount', result: 'Word count: 1' }), 'The text has 1 word.');
    assert.equal(presentResult({ toolName: 'characterCount', args: ['a b'], result: await characterCount('a b') }),
        '“a b” has 3 characters including spaces, or 2 without.');
    const partial = { ...first, toolResults: [first.toolResults[0],
        { toolName: 'wordCount', result: 'Error counting words: unavailable', status: 'failed' }] };
    const reply = formatImmediateToolReply(partial);
    assert(reply.startsWith('I got part of that done.'));
    assert(reply.includes('2 + 2 is 4.'));
    assert(reply.includes('Error counting words: unavailable'));
    assert(!reply.includes('Here you go') && !reply.includes('Task 1'));
    const allFailed = { toolName: 'multi_tool', toolResults: [partial.toolResults[1], partial.toolResults[1]] };
    assert(formatImmediateToolReply(allFailed).startsWith('I couldn’t complete those requests.'));
    const code = 'Content of sample.js:\n\nconst count = 2;\nconsole.log(count);';
    assert.equal(presentResult({ toolName: 'readCode', result: code }), code);
    assert.equal(presentResult({ toolName: 'calculate', result: 'Unexpected format: 4' }), 'Unexpected format: 4');
    const approval = { toolName: 'permission_request', toolResult: 'Approve deletion?' };
    assert.equal(formatImmediateToolReply(approval), approval.toolResult);
    assert.equal(formatImmediateToolReply({ toolName: 'multi_tool', toolResults: [], toolResult: 'No result' }), 'No result');
    console.log('toolResultPresenter.test.js: all assertions passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
