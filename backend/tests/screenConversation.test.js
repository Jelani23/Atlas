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
    console.log('screenConversation.test.js: screen route, personality context, speech, no tools/extraction/pixel persistence passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; state.endSession('screen-test'); });
