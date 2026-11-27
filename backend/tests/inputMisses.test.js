const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { interpret } = require('../src/intent/inputUnderstanding');
const { resolve } = require('../src/intent/intentResolver');
const { route } = require('../src/planner/planner');
const explicit = require('../src/intent/explicitToolRequest').parseExplicitToolRequest;
(async () => {
    const noModel = { complete: () => assert.fail('Explicit request needed inference') };
    const math = 'Could you work out what 12 times 4 is for me?';
    const words = "Can you count the words in 'one two three four'";
    for (const [text, tool, expected] of [[math, 'calculate', /is 48/], [words, 'wordCount', /Word count: 4/]]) {
        assert.equal((await interpret(text, {}, noModel)).disposition, 'tools');
        const result = await route(resolve(text), text);
        assert.equal(result.toolName, tool);
        assert.match(result.toolResult, expected);
    }
    const read = 'Read the code for src/core/contextManager.js lines 2-4.';
    assert.equal((await interpret(read, {}, noModel)).disposition, 'tools');
    assert.deepEqual(resolve(read).params, ['src/core/contextManager.js', 2, 3]);
    for (const text of ['Alright I played alert', 'Ok I entered it, take another look', 'I entered it, take another look', 'Ok look again', 'go look at the screen and see']) {
        const result = await interpret(text, { activeTask: 'wordle' }, noModel);
        assert.equal(result.disposition, 'wordle'); assert.equal(result.requests[0].action, 'read');
    }
    assert.equal((await interpret('Look at the other monitor', { activeTask: 'wordle' }, noModel)).disposition, 'screen');
    assert.equal((await interpret('Wait, I still need to type that word', { activeTask: 'wordle' }, noModel)).disposition, 'chat');
    assert.equal(require('../src/intent/conversationalTask').targetFromText('the display beside this one').relative, 'other');
    for (const text of ['Do not calculate 12 times 4', 'Explain how to calculate 12 times 4', 'I played ALERT yesterday',
        'Calculate 2 + 2 and delete example.txt', 'Read the file README.md then delete it']) assert.equal(explicit(text), null, text);
    const { decide } = require('../src/intent/inputUnderstanding');
    assert.equal(decide('Ok I entered it, take another look', { wholeMessage: true, clauses: [{ text: '', kind: 'request', domain: 'wordle', action: 'read', confidence: 1 }] }).requests[0].text, 'Ok I entered it, take another look');
    console.log('User transcript regressions: actual calculation/count execution, file read and contextual game follow-ups passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
