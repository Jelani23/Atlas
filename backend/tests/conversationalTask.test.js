const assert = require('node:assert/strict');
const { resolve } = require('../src/intent/conversationalTask');
const { createClientSession } = require('../src/devices/clientSession');
const state = require('../src/planner/state');
const { build } = require('../src/response/taskResponseBuilder');
const { handle } = require('../src/puzzles/visualWordle');
const screens = { observedAt: Date.now(), displays: [1, 2].map(id => ({ id: String(id), label: `Display ${id}`, width: 1920, height: 1080, scaleFactor: 1, rotation: 0, current: id === 1, primary: id === 1 })) };
const interaction = { connectionId: 'client', client: { capabilities: { screenshot: { supported: true } } } };
const ctx = { sessionId: 'task-test', interaction, screens };
const result = action => ({ complete: async () => JSON.stringify({ action, target: 'default', monitor: 0 }), permission: () => ({ allowed: true }) });
(async () => {
    assert.deepEqual(await resolve('Alright lets play another game of wordle on my other monitor', ctx, result('start')), { task: 'wordle', action: 'start', displayId: '2' });
    const scope = state.runInSession(ctx.sessionId, () => state.getSessionScope());
    scope.taskFocus = { task: 'wordle', connectionId: 'client', displayId: '2', at: Date.now() };
    assert.equal((await resolve('Another round?', ctx, result('start'))).displayId, '2');
    assert.equal((await resolve('Wordle: new', ctx, result('start'))), null);
    scope.visualWordle = { connectionId: 'client', displayId: '2' };
    for (const active of [true, false]) {
        scope.visualWordle = active ? { connectionId: 'client', displayId: '2' } : null;
        for (const text of ["Can you tell me what's visible on my other monitor?", 'What about on my other monitor?', "Tell me what's happening on monitor 2", "What's happening on my other monitor?", "Um ok I think I fixed your screen sharing, can you tell me what's shown on my other monitor now?"]) {
            assert.equal(await resolve(text, ctx, { complete: async () => { throw new Error('Screen requests must bypass the game classifier'); } }), null, text);
        }
    }
    scope.visualWordle = { connectionId: 'client', displayId: '2' };
    assert.equal((await resolve('I put it in, take a look', ctx, result('read'))).action, 'read');
    assert.equal((await resolve('I entered it, take another look', ctx, { ...result('read'), complete: async () => JSON.stringify({ action: 'read', target: 'current', monitor: 1 }) })).displayId, '2', 'Model must not invent a monitor switch');
    assert.equal((await resolve('Cancel that game', ctx, result('stop'))).action, 'stop');
    assert.equal((await resolve('Explain Wordle strategies', ctx, result('discuss'))).action, 'discuss');
    assert.equal((await resolve('Check my fantasy team', ctx, result('other'))).action, 'discuss');
    assert.equal((await resolve('Start Wordle on monitor 3', ctx, result('start'))).action, 'clarify');
    assert.equal((await resolve('Start Wordle', ctx, { permission: () => ({ allowed: false }) })).action, 'clarify');
    assert.equal((await resolve('Another round?', { ...ctx, interaction: { ...interaction, connectionId: 'other' } }, result('start'))), null);
    const reply = await handle('Cancel that game', { scope, interaction, taskIntent: { action: 'stop' } });
    assert.match(reply, /stopped/); assert.equal(scope.visualWordle, null); assert.equal(scope.taskFocus, null);
    const facts = { task: 'wordle', status: 'suggestion', guess: 'SLATE', turns: 0, first: true };
    const response = text => ({ complete: async () => JSON.stringify({ text }) });
    const request = { result: facts, fallback: 'safe', personality: 'Alice', requestId: 'fixture' };
    assert.equal(await build(request, response('Let’s give {{guess}} a shot. Tell me when you’ve played it.')), 'Let’s give **SLATE** a shot. Tell me when you’ve played it.');
    for (const bad of ['Try CRANE.', 'We won with {{guess}}!', 'I clicked {{guess}}.', '{{guess}} has two green tiles.', 'Try {{guess}} on monitor 2.', "That's the word, {{guess}}! Nice work on that one. Ready for the next challenge?"]) assert.equal(await build(request, response(bad)), 'safe');
    assert.equal(await build(request, { complete: async () => { throw new Error('offline'); } }), 'safe');

    // Receipt is bound to message, connection, session and a single use.
    const registry = { connect: () => 'client', snapshot: () => interaction, disconnect() {} };
    const client = createClientSession(registry, {});
    const atlas = { sessionId: 'receipt-test', sendMessage: async (_text, _interaction, attachments) => attachments };
    const prepared = await client.dispatch('prepareTask', ['Start Wordle on monitor 2', screens], atlas);
    const capture = { data: Buffer.from([255, 216, 255, 217]).toString('base64'), mimeType: 'image/jpeg', width: 10, height: 10, displayId: '2', capturedAt: Date.now() };
    const args = ['Start Wordle on monitor 2', { screens, screenCapture: capture, taskReceipt: prepared.taskReceipt }];
    const sent = await client.dispatch('sendMessage', args, atlas);
    assert.equal(sent.taskIntent.displayId, '2');
    await assert.rejects(client.dispatch('sendMessage', args, atlas), /expired/);
    const stale = await client.dispatch('prepareTask', ['Stop Wordle', screens], atlas);
    atlas.sessionId = 'different';
    await assert.rejects(client.dispatch('sendMessage', ['Stop Wordle', { taskReceipt: stale.taskReceipt }], atlas), /expired/);
    const wrong = await client.dispatch('prepareTask', ['Start Wordle on monitor 2', screens], atlas);
    await assert.rejects(client.dispatch('sendMessage', ['Start Wordle on monitor 2', { screens, screenCapture: { ...capture, displayId: '1' }, taskReceipt: wrong.taskReceipt }], atlas), /does not match/);
    const reset = await client.dispatch('prepareTask', ['Stop Wordle', screens], atlas);
    state.endSession(atlas.sessionId);
    await assert.rejects(client.dispatch('sendMessage', ['Stop Wordle', { taskReceipt: reset.taskReceipt }], atlas), /expired/);
    state.endSession(ctx.sessionId); state.endSession('receipt-test'); state.endSession('different'); client.close();
    console.log('Conversational tasks: replay/continue/stop, monitor binding, permission denial, grounded presentation and single-use receipts passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
