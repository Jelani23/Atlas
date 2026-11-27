const assert = require('node:assert/strict');
const { interpret, decide } = require('../src/intent/inputUnderstanding');
const { prepare } = require('../src/intent/prepareInput');
const state = require('../src/planner/state');
const clause = (text, domain = 'tools', action = 'execute', kind = 'request', confidence = 1) => ({ text, domain, action, kind, confidence });
const response = (...clauses) => ({ complete: async () => JSON.stringify({ clauses }) });
const context = { sessionId: 'input-test', interaction: { connectionId: 'client', client: { capabilities: { screenshot: { supported: true } } } },
    screens: { displays: [{ id: '1', primary: true }, { id: '2', current: true }] } };
(async () => {
    let calls = 0;
    const noModel = { complete: async () => { calls++; throw new Error('Unexpected inference'); } };
    assert.equal((await interpret('Tell me what is shown on monitor 2', {}, noModel)).disposition, 'screen');
    assert.equal((await interpret('done', { activeTask: 'wordle' }, noModel)).disposition, 'wordle');
    assert.equal((await interpret('yes, please', { pendingApproval: true }, noModel)).disposition, 'tools');
    assert.equal(calls, 0);
    for (const text of ['Search the web for basketball scores', 'Calculate 2 + 2', 'word count of hello world',
        'Read the code for src/core/contextManager.js lines 2-4', 'Find the file package.json', 'Delete example.txt',
        'Check my ESPN fantasy team', 'Wordle: new']) {
        const result = await prepare(text, context, response(clause(text)));
        assert.equal(result.action, 'legacy', text);
        assert.equal(result.requestText, text, 'Legacy arguments must preserve source text');
    }
    for (const text of ['The calculation feature works well', 'Do not delete example.txt', 'Explain how file deletion works']) {
        assert.equal((await prepare(text, context, response(clause(text, 'general', 'none', 'chat')))).action, 'chat');
    }
    assert.throws(() => decide('Do not delete example.txt', { clauses: [clause('delete example.txt')] }), /omitted/);
    assert.throws(() => decide('Read README.md', { clauses: [clause('Read secrets.txt')] }), /changed/);
    assert.equal(decide('read it', { clauses: [clause('read it', 'tools', 'execute', 'request', 0.5)] }).disposition, 'clarify');
    const mixed = 'Look at my screen; delete example.txt';
    assert.equal(decide(mixed, { clauses: [clause('Look at my screen;', 'screen', 'inspect'), clause('delete example.txt')] }).disposition, 'clarify');
    const preamble = 'Nice work. Calculate 2 + 2';
    assert.equal((await prepare(preamble, context, response(clause('Nice work.', 'general', 'none', 'chat'), clause('Calculate 2 + 2')))).requestText, 'Calculate 2 + 2');
    const scope = state.runInSession(context.sessionId, () => state.getSessionScope());
    scope.taskFocus = { connectionId: 'client', displayId: '2', at: Date.now() };
    const screenText = 'Could you see what is over on the other monitor?';
    const screen = await prepare(screenText, context, response(clause(screenText, 'screen', 'inspect')));
    assert.equal(screen.displayId, '1', 'Other is relative to the app, not the remembered game display');
    assert.equal(screen.task, 'screen');
    const replay = 'Another round please';
    const game = await prepare(replay, context, { ...response(clause(replay, 'wordle', 'start')), permission: () => ({ allowed: true }) });
    assert.equal(game.displayId, '2');
    assert.equal((await prepare(replay, context, { ...response(clause(replay, 'wordle', 'start')), permission: () => ({ allowed: false }) })).action, 'clarify');
    assert.equal((await prepare('Tell me what is shown on monitor 9', context, noModel)).action, 'clarify');
    const failed = await prepare('Could you find that file?', context, { complete: async () => { throw new Error('timeout'); } });
    assert.equal(failed.action, 'clarify'); assert.match(failed.reply, /No tools ran/);
    const { handle } = require('../src/puzzles/visualWordle');
    assert.equal(await handle('done', { scope, interaction: context.interaction, taskIntent: { task: 'input', action: 'chat' } }), null);
    const preparation = require('../src/intent/prepareInput');
    const originalPrepare = preparation.prepare;
    let signal, release;
    preparation.prepare = async (_text, _ctx, deps) => {
        signal = deps.signal;
        await new Promise(resolve => { release = resolve; });
        return { task: 'input', action: 'chat' };
    };
    const client = require('../src/devices/clientSession').createClientSession({
        connect: () => 'client', snapshot: () => context.interaction, disconnect() {},
    }, {});
    try {
        const pending = client.dispatch('prepareTask', ['hello', null], { sessionId: context.sessionId });
        await client.dispatch('interrupt', [], {}, async () => ({}));
        assert.equal(signal.aborted, true);
        release();
        await assert.rejects(pending, /Conversation changed/);
    } finally { preparation.prepare = originalPrepare; client.close(); }
    state.endSession(context.sessionId);
    console.log('Input understanding: source validation, legacy adapters, chat boundary, monitor binding, permissions and failure behavior passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
