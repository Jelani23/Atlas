const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
const dbPath = require.resolve('../src/database/supabaseClient');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: new Proxy({}, { get() { throw new Error('Database forbidden'); } }) };
const state = require('../src/planner/state');
const permissions = require('../src/permissions/permissionManager');
const tools = require('../src/tools');
const calls = [];
for (const tool of ['deleteNote', 'renameNote', 'calculate', 'wordCount']) {
    tools[tool] = { execute: async (...args) => { calls.push({ tool, args }); return 'Simulated success'; } };
}
const { execute } = require('../src/tools/toolExecutor');
const { route } = require('../src/planner/planner');
const { resolve } = require('../src/intent/intentResolver');
const { executeToolPlan } = require('../src/planner/toolPlanning/toolPlanExecutor');
const ask = (id, text) => state.runInSession(id, () => route(resolve(text), text));

async function main() {
    await ask('a', 'Delete the note called scratchpad');
    await ask('b', 'Yes please');
    assert.equal(calls.length, 0, 'Another conversation cannot approve the deletion');
    await ask('a', 'Yes please');
    assert.deepEqual(calls.pop(), { tool: 'deleteNote', args: ['scratchpad'] });

    const plan = { steps: [{ toolName: 'deleteNote', args: ['scratchpad'], clause: 'delete a note' },
        { toolName: 'wordCount', args: ['hello world'], clause: 'count words' }] };
    state.runInSession('a', () => {
        state.pendingPlan = plan;
        state.lastFileAction = { filename: 'scratchpad' };
        state.lastSearchQuery = 'earlier topic';
    });
    state.runInSession('b', () => {
        assert.equal(state.pendingPlan, null);
        assert.equal(state.lastFileAction, null);
        assert.equal(state.lastSearchQuery, null);
    });
    await ask('b', 'yes');
    assert.equal(calls.length, 0);
    await ask('a', 'yes');
    assert.deepEqual(calls.splice(0).map(call => call.tool), ['deleteNote', 'wordCount']);

    const pending = state.runInSession('a', () => execute('deleteNote', ['scratchpad']));
    const id = [...permissions.pendingRequests.keys()][0];
    assert(id);
    assert.equal(permissions.resolve(id, true, 'b'), false);
    assert.equal(state.runInSession('b', () => permissions.handlePermissionResponse('yes')), false);
    assert(permissions.pendingRequests.has(id));
    state.endSession('a');
    assert.match(await pending, /Permission denied/);
    assert(!permissions.pendingRequests.has(id));
    permissions.resolve(id, true, 'a');
    await ask('a', 'yes');
    assert.equal(calls.length, 0, 'Reopening cannot revive an old approval');

    // Closing while a model is still thinking must not recreate a pending action.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const late = state.runInSession('a', async () => {
        await gate;
        state.pendingAction = { intent: 'deleteNote', params: ['scratchpad'] };
        assert.equal(state.pendingAction, null);
        assert.equal(await permissions.request('deleteNote', ['scratchpad']), false);
        assert.match(await execute('renameNote', ['old', 'new']), /conversation is closed/);
        await route(resolve('Calculate two plus two'), 'Calculate two plus two');
    });
    state.endSession('a');
    release();
    await late;
    assert.equal(calls.length, 0);
    assert.equal(permissions.pendingRequests.size, 0);

    // Stop the remaining steps when a conversation closes between tool results.
    let executed = 0;
    await state.runInSession('plan', () => executeToolPlan(plan, { approved: true,
        runTool: async () => { executed++; state.endSession('plan'); return 'Simulated success'; } }));
    assert.equal(executed, 1);
    const taskManager = require('../src/tasks/taskManager');
    const { eventBus } = require('../src/events/eventBus');
    const EventTypes = require('../src/events/eventTypes');
    let observedScope;
    const taskId = await state.runInSession('queued', () => taskManager.createTask('fixture', async () => {
        observedScope = state.getSessionScope();
        return execute('renameNote', ['old', 'new']);
    }, 'parent-fixture'));
    state.endSession('queued');
    state.runInSession('b', () => eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId: 'parent-fixture' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(observedScope.id, 'queued');
    assert(observedScope.closed);
    assert.equal(calls.length, 0, 'Deferred work cannot borrow the releasing conversation');
    taskManager.tasks.delete(taskId);
    const check = permissions.check;
    permissions.check = () => ({ allowed: false, requiresApproval: false, reason: 'Fixture disabled' });
    assert.match(await state.runInSession('b', () => execute('renameNote', ['old', 'new'], { isApproved: true })), /disabled/);
    assert.equal(calls.length, 0, 'Earlier approval cannot override a disabled policy');
    permissions.check = check;
    state.endSession('b');
    console.log('Conversation-scoped plans, permissions, stale requests and execution passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
