const assert = require('node:assert/strict');
const continuity = require('../src/intent/conversationContinuity');
const { parseNumericRequests } = require('../src/intent/explicitToolRequest');
const { prepare } = require('../src/intent/prepareInput');
const state = require('../src/planner/state');
const fantasy = require('../src/integrations/espnFantasyIntent');
(async () => {
    const scope = state.runInSession('continuity-test', () => state.getSessionScope());
    const request = 'Work out what 28 times 37 is, and also count the words in "keep this short please"';
    const numericRequests = parseNumericRequests(request);
    assert.deepEqual(numericRequests.map(r => r.toolName), ['calculate', 'wordCount']);
    assert.equal(numericRequests[1].args[0], 'keep this short please');
    assert.equal(await require('../src/tools/utilities/wordCount').execute(numericRequests[1].args[0]), 'Word count: 4');
    assert.equal(await require('../src/tools/utilities/wordCount').execute(''), 'Word count: 0');
    assert.equal(parseNumericRequests('Count the words in "one and two; three"')[0].args[0], 'one and two; three');
    assert.deepEqual(parseNumericRequests('Calculate 2 + 2 and delete README.md'), []);
    assert.deepEqual(parseNumericRequests('Do not calculate 2 + 2'), []);
    continuity.user(scope, 'pc', request);
    continuity.task(scope, { name: 'multi_tool', numericRequests });
    continuity.assistant(scope, 'The results are 1,036 and 4 words.');
    assert.equal(continuity.get(scope, 'mac'), null);
    assert.equal(continuity.get(scope, 'pc', Date.now() + 600001), null);
    const context = { sessionId: 'continuity-test', interaction: { connectionId: 'pc' } };
    const recheck = await prepare('That count seems wrong; check it again.', context, {
        interpret: async (text, supplied) => {
            assert.equal(supplied.conversation.turns[1].role, 'assistant');
            const clause = { text, kind: 'request', domain: 'tools', action: 'execute', reference: 'wordCount' };
            return { disposition: 'tools', clauses: [clause], requests: [clause] };
        },
    });
    assert.equal(recheck.requestText, 'Count the words in "keep this short please"');
    const compact = await require('../src/intent/inputUnderstanding').interpret('Please recheck that result.',
        { conversation: { lastTask: { numericRequests } } }, { complete: async (_messages, options) => {
            assert.ok(options.format.required.includes('reference'));
            return JSON.stringify({ route: 'tools', confidence: 1, target: { relative: 'default', monitor: 0 }, reference: 'wordCount' });
        } });
    assert.equal(compact.requests[0].text, 'Please recheck that result.');
    assert.equal(compact.requests[0].reference, 'wordCount');
    const tomorrow = await fantasy.resolve('What is my fantasy projected score tomorrow?', [], {
        interpret: async () => ({ kind: 'read', actions: ['forecast'] }),
    });
    assert.equal(tomorrow.kind, 'unsupported');
    assert.match(tomorrow.reply, /individual day/);
    const full = await fantasy.resolve('Give me my fantasy full breakdown', [], {
        interpret: async () => ({ kind: 'read', actions: ['overview', 'roster', 'standings', 'matchup', 'played_games', 'injuries'] }),
    });
    assert.deepEqual(full.actions, ['overview', 'injuries']);
    state.endSession('continuity-test');
    console.log('Continuity: exact correction arguments, multi-request counts, isolation, expiry and fantasy scope passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
