const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const enginePath = require.resolve('../src/core/conversationEngine');
const originalLoad = Module._load;
const state = require('../src/planner/state');
const bus = new EventEmitter();
const eventTypes = require('../src/events/eventTypes');
const stored = [], spoken = [], emitted = [];
bus.on(eventTypes.REQUEST_STARTED, payload => emitted.push(payload));
let visionCalls = 0;
const capture = { data: 'private-pixels', displayId: '2' };
const interaction = { client: { displayName: 'MacBook' }, screens: { displays: [{ id: '2' }] } };
const fixtures = {
    '../intent/conversationContinuity': require('../src/intent/conversationContinuity'),
    '../response/deviceResponse': require('../src/response/deviceResponse'),
    '../response/responseBuilder': require('../src/response/responseBuilder'),
    '../response/directResponse': require('../src/response/directResponse'),
    '../puzzles/visualWordle': { handle: async (text, options) => {
        if (text !== 'start Wordle on monitor 2') return null;
        assert.equal(options.capture, capture);
        assert.equal(options.interaction, interaction);
        options.scope.visualWordle = { displayId: '2' };
        options.scope.taskResult = { task: 'wordle', status: 'suggestion', guess: 'SLATE', turns: 0 };
        return 'Try SLATE. Say done after entering it.';
    } },
    '../response/taskResponseBuilder': { build: async ({ result, personality }) => {
        assert.equal(result.guess, 'SLATE'); assert.match(personality, /Existing personality/);
        return 'Try SLATE. Say done after entering it.';
    } },
    '../models/modelAdapter': { createModelAdapter: () => ({}) },
    '../memory/knowledgePersistencePolicy': { isSearchKnowledgePersistenceEnabled: () => false },
    '../planner/state': state,
    '../tasks/taskManager': { startRequest() {}, endRequest() {}, cancelTask() {}, createTask() { throw new Error('Screenshot must not trigger memory extraction'); } },
    '../events/eventBus': { eventBus: bus },
    '../events/eventTypes': eventTypes,
    '../intent/intentResolver': { resolve: () => ({ intent: 'conversation' }) },
    '../agents/agentProfiles': { getAgentProfile: async () => ({ agentId: 'alice', profile: { name: 'fixture' } }) },
    '../voice/tts/ttsQueue': { stop() {} },
    '../voice/tts/ttsManager.js': { enqueue: text => spoken.push(text) },
    '../voice/tts/speechPreprocessor': { prepareForTTS: text => text },
    '../response/processor': { removeThinkingTraces: text => text },
    './codeEvidence': { followUp: () => null },
    './contextBuilder': { buildContext: async () => { throw new Error('Prior screen descriptions must not enter fresh vision context'); } },
    './personalityEngine': { getSystemPrompt: (_mode, _policy, _style, profile, context) => { assert.equal(profile.name, 'fixture'); assert.deepEqual(context.history, []); return 'Existing personality'; } },
    '../devices/interactionContext': { buildDeviceContext: value => { assert.equal(value, interaction); return 'Current Mac monitor'; } },
    '../devices/screenAnalysis': { analyzeScreen: async options => { visionCalls++; assert.equal(options.capture, capture); assert.match(options.context, /Existing personality/); return 'A test image is visible.'; } },
};
Module._load = function(request, parent, ...args) {
    if (parent?.filename === enginePath) {
        if (fixtures[request]) return fixtures[request];
        throw new Error(`Unexpected screen-route dependency: ${request}`);
    }
    return originalLoad.call(this, request, parent, ...args);
};
// Import-time dependencies outside the screen path must be inert, while calling
// any of their functions still fails. The dynamic planner is never reached.
const importOnly = ['../models/modelRouter','../planner/planner','../memory/memoryExtractor','../memory/semanticEnricher','../reasoning/controller','../intent/intentCategory','../utils/searchEvidence','../response/controller','../memory/memoryManager','../response/toolResultPresenter','./personalityEngine','../memory/sessionManager','./memoryCache','../utils/keywordExtractor','../utils/thinkFilter','./contextManager','../memory/reflectionAnswerResolver','../utils/turnGrounding','../response/recovery','./capabilityContext','../intent/capabilityRequest','../memory/knowledgeAnswerBoundary','../response/groundedAnswers','../response/preferenceAnswers'];
for (const name of importOnly) fixtures[name] ||= {};
const engine = require(enginePath);
const memory = { workingMemory: { getHistory: async () => [], append: async message => { stored.push(message); return 'id'; } } };
(async () => {
    const result = await engine.handleMessage('Describe this screen', { memory, mode: 'casual', sessionId: 'screen-test', taskId: 'screen-task', requestId: 'screen-request', interaction, screenCapture: capture });
    assert.equal(result.reply, 'A test image is visible.');
    assert.equal(visionCalls, 1);
    assert.deepEqual(spoken, ['A test image is visible.']);
    assert.equal(stored.length, 2);
    assert(!JSON.stringify(stored).includes('private-pixels'));
    assert(!JSON.stringify(emitted).includes('private-pixels'));
    const unavailable = "I can't look at monitor 3 because this device only has 2 connected screens.";
    const failed = await engine.handleMessage('Look at monitor 3', { memory, mode: 'casual', sessionId: 'screen-test', taskId: 'screen-missing', requestId: 'missing-request', interaction, screenRequestError: unavailable });
    assert.equal(failed.reply, unavailable);
    assert.equal(spoken.at(-1), unavailable);
    assert.equal(visionCalls, 1, 'Out-of-range requests must not invoke vision');
    const game = await engine.handleMessage('start Wordle on monitor 2', { memory, mode: 'casual', sessionId: 'screen-test', taskId: 'wordle-task', requestId: 'wordle-request', interaction, screenCapture: capture });
    assert.equal(game.reply, 'Try SLATE. Say done after entering it.');
    assert.equal(game.visualWordleActive, true);
    assert.equal(spoken.at(-1), game.reply);
    assert.equal(visionCalls, 1, 'Visual Wordle must precede general screen descriptions');
    const devices = await engine.handleMessage('Which devices are online?', { memory, mode: 'casual', sessionId: 'screen-test', taskId: 'device-task', requestId: 'device-request',
        taskIntent: { task: 'devices', action: 'read' }, interaction: { deviceInventory: { observedAt: Date.now(), devices: [
            { client: { displayName: 'MacBook', os: 'macos', capabilities: {} }, online: false, current: false, screens: null, lastSeen: Date.now() },
        ] } } });
    assert.match(devices.reply, /MacBook — offline/);
    assert.equal(spoken.at(-1), devices.reply);
    assert.equal(stored.at(-1).content, devices.reply);
    assert.equal(visionCalls, 1, 'Device questions must not capture or inspect screens');
    const current = await engine.handleMessage('What device am I currently messaging from?', { memory, mode: 'casual', sessionId: 'screen-test', taskId: 'current-device-task', requestId: 'current-device-request',
        taskIntent: { task: 'devices', action: 'read', query: { scope: 'current', topic: 'status', name: '' } },
        interaction: { deviceInventory: { observedAt: Date.now(), devices: [
            { client: { displayName: 'Windows PC', os: 'windows', capabilities: {} }, online: true, current: true },
            { client: { displayName: 'Mac', os: 'macos', capabilities: {} }, online: false, current: false },
        ] } } });
    assert.equal(current.reply, 'You’re messaging me from Windows PC, running Windows.');
    assert.equal(spoken.at(-1), current.reply);
    console.log('screenConversation.test.js: screen route, personality context, speech, no tools/extraction/pixel persistence passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; state.endSession('screen-test'); });
