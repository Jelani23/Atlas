// Real conversation engine, resolver, planner, permission check and presenter.
// Only external storage, model, speech playback and the ESPN network are stubbed.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
const speech = [], actions = [], events = [];
stub('../src/agents/agentProfiles', { getAgentProfile: async () => ({ agentId: 'alice', source: 'test', profile: require('../src/core/atlasState').atlasState }) });
const interpreted = [], replies = ['roster', 'overview', 'standings', 'standings', 'standings', 'free_agents', 'league_injuries', 'injuries'];
stub('../src/models/modelAdapter', { createModelAdapter: () => ({ complete: async messages => {
    assert.match(messages[0].content, /You route requests/);
    interpreted.push(messages);
    return JSON.stringify({ kind: 'read', actions: [replies[interpreted.length - 1]] });
} }) });
stub('../src/tasks/taskManager', { startRequest() {}, endRequest() {}, createTask() {} });
stub('../src/events/eventBus', { eventBus: { emit: (...args) => events.push(args), on() {} } });
stub('../src/voice/tts/ttsQueue', { stop() {} });
stub('../src/voice/tts/ttsManager', { enqueue: text => speech.push(text), getStatus: () => ({}) });
stub('../src/memory/sessionManager', { getWorkingContext: async () => ({}) });
// If a fantasy request reaches source detection, reproduce the bad route loudly.
stub('../src/reasoning/projectQuestion', { detect() { throw new Error('Fantasy request reached source detection'); } });
const { format } = require('../src/integrations/espnFantasy');
require('../src/tools').espnFantasy.execute = async action => {
    actions.push(action);
    return format({ team: { team_id: 7, team_name: 'Jitters' }, scoringType: 'H2H_POINTS',
        roster: [{ name: 'Jayson Tatum', proTeam: 'BOS', position: 'PF', lineupSlot: 'PF', injuryStatus: 'ACTIVE', avg_points: 47.12 }],
        standings: [{ team_id: 7, team_name: 'Jitters', standing: 2, wins: 2, losses: 0, ties: 0 }] }, action);
};
const { handleMessage } = require('../src/core/conversationEngine');
const state = require('../src/planner/state');
const history = [];
const memory = { workingMemory: { getHistory: async () => history.slice(-4), append: async message => { history.push(message); return history.length; } } };
(async () => {
    for (const input of ['Can you show my fantasy basketball roster?', 'Can you give me an overview of my fantasy NBA?',
        "What's my current ranking in my ESPN fantasy NBA league?", 'you tell me the standings and my ESPN fan is the NBA lude',
        'Can you show me my current standings in my fantasy league?',
        'Who is available?', 'What about injuries across the league?', 'Just on my team?']) {
        await state.runInSession('fantasy-test', async () => {
            state.projectQuestion = { path: 'src/tools/fantasy/espnFantasy.js', agentId: 'alice', at: Date.now() };
            const result = await handleMessage(input, { memory, mode: 'casual', sessionId: 'fantasy-test', taskId: 'test', requestId: 'test' });
            assert.match(result.reply, /Jitters/);
            assert.match(result.reply, /ranked 2/);
            assert.match(result.reply, /BOS, PF; slot: PF; status: ACTIVE/);
            assert.equal(history.at(-1).content, result.reply, 'Stored chat retains display text');
            assert.match(speech.at(-1), /power forward for Boston Celtics/);
            assert.doesNotMatch(speech.at(-1), /\b(?:BOS|PF|ACTIVE)\b|Source:/);
            assert.equal(state.projectQuestion, null);
        });
    }
    assert.deepEqual(actions, replies);
    assert.equal(interpreted.length, actions.length, 'Interpret each turn once before source routing');
    assert(interpreted.at(-1).slice(1, -1).some(m => m.content.includes('across the league')), 'Follow-up includes prior user context');
    assert(!events.some(([type]) => type === 'request_failed'));
    console.log('Fantasy conversation routing and speech regression passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
