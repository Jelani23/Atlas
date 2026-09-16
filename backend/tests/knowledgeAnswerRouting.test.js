const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
let modelCalls = 0;
let extracted = 0;
let relevantMemory = {};
const spoken = [];
const events = [];
stub('../src/models/modelAdapter', { createModelAdapter: () => ({
    complete: async () => { modelCalls++; throw new Error('Unexpected model call'); },
    streamComplete: async function* () { modelCalls++; throw new Error('Unexpected model call'); }
}) });
stub('../src/planner/planner', { route: async () => ({ needsTool: false }) });
stub('../src/intent/intentResolver', { resolve: () => ({}) });
stub('../src/core/contextManager', { getRelevantContext: async () => relevantMemory });
stub('../src/tasks/taskManager', {
    startRequest() {}, endRequest() {}, createTask() { extracted++; }
});
stub('../src/events/eventBus', { eventBus: { emit: (...args) => events.push(args), on() {} } });
stub('../src/voice/tts/ttsQueue', { stop() {} });
stub('../src/voice/tts/ttsManager', { enqueue: text => spoken.push(text), getStatus: () => ({}) });
stub('../src/memory/sessionManager', { getWorkingContext: async () => ({}) });
const { handleMessage } = require('../src/core/conversationEngine');
const history = [];
const memory = { workingMemory: {
    getHistory: async () => history.slice(-4),
    append: async message => { history.push(message); return history.length; }
} };
async function ask(input) {
    const result = await handleMessage(input, {
        memory, mode: 'casual', sessionId: 'test', taskId: 'test', requestId: 'test'
    });
    assert(!events.some(([type]) => type === 'request_failed'), JSON.stringify(events));
    return result.reply;
}
async function main() {
    // Reproduce the user's two-turn transition through the real controller,
    // including the history append and spoken reply. No model/database work.
    assert.match(await ask('What all do you remember about neuro sama?'), /don't have verified information/);
    assert.match(await ask('What do you know about Neuro sama?'), /don't have verified information/);
    assert.equal(modelCalls, 0);
    assert.equal(extracted, 0, 'Recall questions must not create extraction work');
    assert.equal(spoken.length, 2);
    assert.equal(history.filter(row => row.role === 'assistant').length, 2);
    relevantMemory = { knowledge: [{
        id: 1, subject: 'neuro_sama', key: 'creator', value: 'Neuro-sama was created by Vedal.',
        type: 'fact', source_type: 'web_search', source: 'https://github.com/Vedal987',
        topics: ['neuro_sama'], confidence: 0.95,
        verification_status: 'verified', verification_method: 'manual',
        verification_sources: [{ url: 'https://github.com/Vedal987' }]
    }] };
    assert.match(await ask('Could you tell me about Neuro-sama?'), /created by Vedal/);
    const inventory = await ask('What are all the tools that you have available to use?');
    assert.match(inventory, /Notes:/);
    assert(!inventory.includes('listNotes'));
    assert.equal(modelCalls, 0);
    console.log('knowledgeAnswerRouting.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
