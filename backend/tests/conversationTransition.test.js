const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('dotenv', { config() {} });
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
const state = require('../src/planner/state');
const permissions = require('../src/permissions/permissionManager');
let next = 1;
let closeGate = null;
const sessions = {
    async endSession() { if (closeGate) await closeGate; return { deleted: true }; },
    async startSession() { return `new-${next++}`; },
    async resumeSession(id) { return id; },
    async deleteSession() {},
    async supportsReflectionLifecycle() { return true; }
};
const dispatched = [];
const removedWordleSaves = [];
stub('../src/puzzles/wordleStore', { remove(id) { removedWordleSaves.push(id); } });
stub('../src/core/conversationEngine', { async handleMessage(text, options) {
    dispatched.push({ text, id: options.sessionId, ...(options.interaction ? { interaction: options.interaction } : {}) }); return 'Simulated reply';
} });
stub('../src/memory/sessionManager', sessions);
stub('../src/memory', { workingMemory: { async clear() {} } });
stub('../src/core/personalityEngine', { DEFAULT_MODE: 'casual' });
stub('../src/core/contextManager', { registerPreviousSession() {} });
stub('../src/events/eventBus', { eventBus: new EventEmitter() });
stub('../src/events/eventLogger', { initialize() {} });
stub('../src/memory/reflectionWorker', { shutdown() {} });
stub('../src/learning/worker', { async shutdown() {} });
for (const path of ['../src/core/projectCache', '../src/models/providers/ollama', '../src/models/modelRouter']) stub(path, {});
const { AtlasInterface } = require('../src/interface/atlasInterface');

async function main() {
    const app = new AtlasInterface();
    const errors=[];
    app.on('atlas.error', payload=>errors.push(payload.message));
    const bus=require('../src/events/eventBus').eventBus;
    const types=require('../src/events/eventTypes');
    bus.emit(types.REQUEST_FAILED,{error:'Already returned',reply:'Already returned'});
    assert.deepEqual(errors,[]);
    bus.emit(types.REQUEST_FAILED,{error:'Transport failed'});
    assert.deepEqual(errors,['Transport failed']);
    app.ready = true;
    app.sessionId = 'old';
    let releasePilot;
    let pilotGate = new Promise(resolve => { releasePilot = resolve; });
    let holds = 0, pilotStopped = false;
    app.evidencePilot = {
        async foreground(fn) { holds++; try { await pilotGate; return await fn(); } finally { holds--; } },
        async stop() { pilotStopped = true; }, status() { return { enabled: true }; }
    };
    const interaction = Object.freeze({ connectionId: 'pc-connection', client: { deviceId: 'pc' } });
    const gatedMessage = app.sendMessage('pilot gate', interaction);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dispatched.length, 0, 'Real interface must await pilot settlement before routing.');
    releasePilot(); await gatedMessage; pilotGate = null;
    assert.equal(holds, 0);
    const gatedDispatch = dispatched.pop();
    assert.equal(gatedDispatch.text, 'pilot gate');
    assert.equal(gatedDispatch.interaction, interaction, 'Device context survives the asynchronous pilot gate');
    const approvals = [];
    function pending() {
        const id = app.sessionId;
        state.runInSession(id, () => {
            state.pendingAction = { intent: 'deleteNote', params: ['scratchpad'] };
            state.pendingPlan = { steps: [] };
            state.lastFileAction = { filename: 'scratchpad' };
            approvals.push(permissions.request('deleteNote', ['scratchpad']));
        });
        return state.runInSession(id, () => state.getSessionScope());
    }
    const old = pending();
    let release;
    closeGate = new Promise(resolve => { release = resolve; });
    const transition = app.newConversation();
    const during = app.sendMessage('yes');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dispatched.length, 0, 'Messages wait for the new conversation');
    assert(old.closed);
    assert.equal(app.resolvePermission('old-id', true), false);
    release();
    await transition;
    await during;
    closeGate = null;
    assert.deepEqual(dispatched, [{ text: 'yes', id: 'new-1' }]);
    assert.equal(old.pendingAction, null);
    assert.equal(old.pendingPlan, null);
    assert.equal(old.lastFileAction, null);

    const reset = pending();
    await app.resetConversation();
    assert(reset.closed);
    assert.deepEqual(removedWordleSaves, ['new-1']);
    const resumed = pending();
    await app.resumeConversation('old');
    assert(resumed.closed);
    state.runInSession('old', () => assert.equal(state.pendingAction, null));
    const deleted = pending();
    await app.deleteConversation('old');
    assert(deleted.closed);
    assert.deepEqual(removedWordleSaves, ['new-1', 'old']);
    assert.equal(app.sessionId, 'new-2');
    const shutdown = pending();
    await app.shutdown();
    assert(pilotStopped, 'Application shutdown must stop the pilot.');
    assert(shutdown.closed);
    assert.deepEqual(await Promise.all(approvals), [false, false, false, false, false]);
    assert.equal(permissions.pendingRequests.size, 0);
    await assert.rejects(app.sendMessage('yes'), /shutting down/);
    console.log('Conversation lifecycle invalidation and transition dispatch passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
