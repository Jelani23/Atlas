const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
let modelCalls = 0;
let modelPrompt = '';
let modelOptions = {};
let tts = {};
let history = [];
let relevantMemory = { hotState: { activeFiles: [] } };
let extracted = 0;
let historyFailure = false;
let historyReads = 0;
let plannerCalls = 0;
let plannedResult = { needsTool: false };
let agentProfile = structuredClone(require('../src/core/atlasState').atlasState);
stub('../src/agents/agentProfiles', { getAgentProfile: async () => ({
    agentId: 'alice', source: 'database', revision: 7, profile: structuredClone(agentProfile), degraded: false
}) });
const spoken = [];
const events = [];
stub('../src/models/modelAdapter', { createModelAdapter: () => ({
    complete: async (messages, options) => {
        modelCalls++;
        modelPrompt = messages[0].content;
        modelOptions = options;
        return 'Final response:\nA contextual answer.';
    }
}) });
stub('../src/planner/planner', { route: async () => { plannerCalls++; return plannedResult; } });
stub('../src/intent/intentResolver', { resolve: () => ({}) });
stub('../src/core/contextManager', { getRelevantContext: async () => relevantMemory });
stub('../src/tasks/taskManager', { startRequest() {}, endRequest() {}, createTask() { extracted++; } });
stub('../src/events/eventBus', { eventBus: { emit: (...args) => events.push(args), on() {} } });
stub('../src/voice/tts/ttsQueue', { stop() {} });
stub('../src/voice/tts/ttsManager', { enqueue: text => spoken.push(text), getStatus: () => tts });
stub('../src/memory/sessionManager', { getWorkingContext: async () => ({}) });
const { handleMessage } = require('../src/core/conversationEngine');
const memory = { workingMemory: {
    getHistory: async () => {
        historyReads++;
        if (historyFailure) throw Object.assign(new Error('Conversation history could not be loaded.'), { code: 'HISTORY_UNAVAILABLE' });
        return history.slice(-4);
    },
    append: async message => { history.push(message); return history.length; }
} };
async function ask(input, reset = true, mode = 'casual') {
    if (reset) history = [];
    const result = await handleMessage(input, {
        memory, mode, sessionId: 'grounded-test', taskId: 'test', requestId: 'test'
    });
    assert(!events.some(([type]) => type === 'request_failed'), JSON.stringify(events));
    assert.equal(history.at(-1).content, result.reply);
    assert.equal(spoken.at(-1), result.reply);
    return result.reply;
}
async function main() {
    plannedResult = { needsTool: true, shortCircuit: true, toolName: 'readCode',
        toolResult: 'Content of src/agents/agentProfiles.js:\nconst fallback = { source: "cached_database", degraded: true };' };
    await handleMessage('Read the code for agentProfiles.js', {
        memory, mode: 'casual', sessionId: 'grounded-test', taskId: 'test', requestId: 'code-read'
    });
    plannedResult = { needsTool: false };
    assert.equal(await ask('Based on that code, what happens if the database read fails after a profile was already cached?', false), 'A contextual answer.');
    assert.match(modelPrompt, /PREVIOUS CODE-READ EVIDENCE/);
    assert.match(modelPrompt, /cached_database/);
    await ask('Review that code for bugs and suggest tests', false, 'analysis');
    assert.equal(modelOptions.model, require('../src/models/modelRouter').getModelForTask('analyze_and_suggest').model);
    assert.equal(modelOptions.think, false);
    assert.match(modelPrompt, /Distinguish source observations from hypotheses/);
    await ask('Different topic: tell me about penguins', false);
    assert.doesNotMatch(modelPrompt, /PREVIOUS CODE-READ EVIDENCE/);
    assert.match(await ask('Based on that code, what happens if the database read fails after a profile was already cached?', false), /verified implementation evidence/);
    modelCalls = 0;
    extracted = 0;
    assert.match(await ask('How does your memory work?'), /durable memories across conversations/);
    assert.match(await ask('Can you explain how to delete a note?'), /you approve or deny/);
    assert.match(await ask('How does your knowledge library work?'), /provisional records/);
    assert.match(await ask('Do you remember which game we played together last night?'), /context available to me/);
    tts = { enabled: true, provider: 'kokoro', health: 'unknown' };
    relevantMemory.features = [{ feature: 'TTS', status: 'planned' }];
    assert.match(await ask('Is your TTS implemented or still planned?'), /outdated/);
    assert.match(await ask('Is your TTS working?'), /readiness is unconfirmed/);
    tts.health = 'unavailable';
    assert.match(await ask('Is your TTS working?'), /reported speech unavailable/);
    assert.equal(modelCalls, 0);
    assert.equal(extracted, 0, 'Read-only operating answers must not create extraction tasks');
    relevantMemory.personal = [{ key: 'last_game', value: 'We played Celeste yesterday.' }];
    assert.equal(await ask('Do you remember which game we played together last night?'), 'A contextual answer.');
    assert.equal(modelCalls, 1, 'Possible event evidence must reach contextual generation');
    assert.match(modelPrompt, /We played Celeste yesterday/);
    relevantMemory = { hotState: { activeFiles: [] }, personal: [{ key: 'favorite_game', value: 'Minecraft' }] };
    await ask('SQLite is an in process database library');
    assert.equal(modelOptions.temperature, 0);
    assert(!modelPrompt.includes('Minecraft'), 'Unrelated preferences must not enter a technical reply');
    await ask('What games do you like?');
    assert(modelOptions.temperature > 0, 'Personal voice keeps existing sampling');
    assert.match(modelPrompt, /Hollow Knight/);
    // Reproduce the five-turn app sequence with crowded but irrelevant memory.
    relevantMemory = { hotState: { activeFiles: [], activeProject: 'atlas' },
        personal: [{ key: 'favorite_games', value: 'Minecraft and Celeste' },
            ...Array.from({ length: 27 }, (_, i) => ({ key: `detail_${i}`, value: `Profile detail ${i}` }))],
        projects: [{ project_key: 'atlas', subject: 'database', key: 'storage', value: 'Project uses a database.' }],
        reflections: [{ summary: 'We discussed databases and memory.' }],
        conversationHistory: [{ role: 'assistant', content: 'You like Spelunky and Hollow Knight.' }] };
    await ask('SQLite is an in-process database library.');
    await ask('JSON allows comments in its standard syntax, right?', false);
    const beforeRecall = modelCalls;
    assert.match(await ask('Do you remember which game we played together last night?', false), /context available/);
    assert.equal(modelCalls, beforeRecall);
    await ask('Is your TTS currently working?', false);
    const comparison = await ask('What games do I like, and what games do you like?', false);
    assert.match(comparison.split('As for me')[0], /Minecraft and Celeste/);
    assert.doesNotMatch(comparison.split('As for me')[0], /Spelunky|Hollow Knight/);
    assert.match(comparison.split('As for me')[1], /Hollow Knight/);
    assert.equal(modelCalls, beforeRecall);

    agentProfile.identity.name = 'Test Agent';
    agentProfile.preferences.enjoys = ['games: Go and Portal'];
    relevantMemory = { hotState: { activeFiles: [] }, personal: [{ key: 'favorite_games', value: 'Minecraft and Celeste' }] };
    const changed = await ask('What games do I like, and what games do you like?');
    assert.match(changed, /As for me, I enjoy Go and Portal/);
    assert.doesNotMatch(changed, /Hollow Knight/);
    await ask('What games do you like?');
    assert.match(modelPrompt, /Test Agent/);
    assert.match(modelPrompt, /Go and Portal/);
    assert.doesNotMatch(modelPrompt, /Hollow Knight/);
    agentProfile = structuredClone(require('../src/core/atlasState').atlasState);

    const beforeFailure = { calls: modelCalls, planner: plannerCalls, messages: history.length };
    historyFailure = true;
    const failed = await handleMessage('Delete the note called scratchpad', {
        memory, mode: 'casual', sessionId: 'grounded-test', taskId: 'test', requestId: 'history-failure'
    });
    assert.match(failed.reply, /couldn't load this conversation's history/);
    assert.equal(plannerCalls, beforeFailure.planner);
    assert.equal(modelCalls, beforeFailure.calls);
    assert.equal(history.length, beforeFailure.messages);
    historyFailure = false;
    events.length = 0;
    const beforeRecovery = historyReads;
    await ask('SQLite is an in-process database library.');
    assert.equal(historyReads - beforeRecovery, 1, 'Generation must reuse the successful history snapshot');
    console.log('Grounded answers preserve history, speech, runtime state and contextual fallthrough.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
