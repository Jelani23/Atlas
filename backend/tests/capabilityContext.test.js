const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async () => { throw new Error('No network in capability tests'); };
const { GROUPS, TOOL_LABELS, getCatalog, formatToolInventory, selectTopics, buildCapabilityContext, hasOperatingGuideAnswer, isKnowledgePipelineExplanation } = require('../src/core/capabilityContext');
const tools = require('../src/tools');
const catalog = getCatalog();
const { isToolInventoryRequest } = require('../src/intent/capabilityRequest');

async function main() {
    assert.deepEqual(selectTopics('Where are your own personality and preferences stored, compared with my preferences?'), ['memory']);
    assert.deepEqual(selectTopics('What are your favorite games?'), []);
    const profileGuide = buildCapabilityContext({ userInput: 'Where is your personality stored?',
        runtime: { agentProfile: { agentId: 'alice', source: 'database', revision: 1 } } });
    assert.match(profileGuide, /agent_profiles/);
    assert.match(profileGuide, /user_profile/);
    assert.match(profileGuide, /source this turn: database/);
    // New exports cannot silently escape the documented inventory, and a
    // schema without a matching executable must never be advertised as ready.
    for (const tool of Object.values(tools)) {
        assert(catalog.some(row => row.name === tool.intentSchema?.name), `Undocumented tool ${tool.intentSchema?.name}`);
    }
    assert.equal(catalog.find(row => row.name === 'deleteNote').status, 'requires approval');
    assert.match(catalog.find(row => row.name === 'propose_code_change').status, /^unavailable/);
    const restricted = getCatalog({ tools, checkPermission: () => ({ allowed: false, requiresApproval: false }) });
    assert.equal(restricted.find(row => row.name === 'readNote').status, 'disabled by policy');
    const missing = getCatalog({ tools: {}, checkPermission: () => ({ allowed: true }) });
    assert(missing.every(row => row.status.startsWith('unavailable')));
    const inventory = formatToolInventory();
    for (const entry of catalog) {
        assert(TOOL_LABELS[entry.name], entry.name);
        assert(inventory.includes(TOOL_LABELS[entry.name]), `Inventory dropped ${entry.name}`);
    }
    assert(inventory.includes('delete a note (requires your approval)'));
    assert(inventory.includes('Not available to use: propose a code change'));
    assert(!inventory.includes('listNotes'));
    assert(!inventory.includes('webSearch'));
    assert(inventory.includes('search stored knowledge by topic'));
    assert(!formatToolInventory(restricted).includes('Notes:'), 'Disabled tools must not be advertised as usable');
    for (const topic of Object.values(GROUPS)) {
        for (const source of topic.sources) assert(require('node:fs').existsSync(require('node:path').join(__dirname, '../src', source)), source);
    }
    assert.deepEqual(selectTopics('What tools do you have'), Object.keys(GROUPS));
    for (const input of ['What are all the tools you have available?', 'What are all the tools that you have available to use?', 'Which tools can you use',
        'Can you list all your tools', 'Show me the available tools', 'What tools are available to you',
        'Please list all of your tools', 'What are your tools', 'Could you give me a list of your tools', 'Tell me what tools you can use']) {
        assert(isToolInventoryRequest(input), input);
        assert.deepEqual(selectTopics(input), Object.keys(GROUPS), input);
    }
    for (const input of ['What tools does Qwen support', 'Search the web for tools',
        'List notes', 'What tools do you have and delete the note called scratchpad',
        'Count the words in what tools do you have']) assert(!isToolInventoryRequest(input), input);
    assert.deepEqual(selectTopics('What arguments does appendNote need'), ['notes']);
    assert.deepEqual(selectTopics('How does searchKnowledge work'), ['memory']);
    assert(selectTopics('Can you explain how to delete a note').includes('notes'));
    assert(selectTopics('I was wondering how to delete a note').includes('notes'));
    assert(selectTopics('You understand the current state of your TTS right').includes('voice'));
    assert(selectTopics('What model are you running').includes('system'));
    assert(selectTopics('Do you have file access').includes('files'));
    assert(selectTopics('What else?', [{ role: 'user', content: 'What tools do you have' }]).includes('notes'));
    assert.deepEqual(selectTopics('What else?', [{ role: 'assistant', content: 'What tools do you have' }]), []);
    assert.equal(buildCapabilityContext({ userInput: 'Tell me a joke about a missing semicolon' }), '');
    for (const input of ['What are the latest AI models', 'Can you tell me about the latest Qwen models',
        'Explain how JavaScript code works', 'What do you remember about me', 'What kinds of music do you like']) {
        assert.deepEqual(selectTopics(input), [], `Do not turn a general topic into Atlas: ${input}`);
    }
    assert(hasOperatingGuideAnswer('Does your current TTS pipeline support language switching'));
    assert(!hasOperatingGuideAnswer('Does your TTS schema already include a language column'));
    assert(!hasOperatingGuideAnswer('Does the database already include verified_at'));
    assert(isKnowledgePipelineExplanation('How does your knowledge library work?'));
    assert(!isKnowledgePipelineExplanation('What verified knowledge do you have?'));
    assert(!isKnowledgePipelineExplanation('Can you tell me all the things in your knowledge library about Ollama'));

    const { buildContext } = require('../src/core/contextBuilder');
    require('../src/memory/worldModel').getAll = () => { throw new Error('Do not load the stale world model'); };
    const relevantMemory = { hotState: { activeProject: null, activeFiles: [], currentTask: null },
        personal: [], state: [], projects: [], projectNames: {}, knowledge: [], procedures: [],
        features: [{ feature: 'TTS', status: 'planned', updated_at: '2025-01-01T00:00:00Z' }],
        reflections: [], conversationHistory: [] };
    const prompt = await buildContext({ mode: 'casual', intent: { intent: 'conversation' },
        userInput: 'Explain your TTS pipeline', history: [], workingContext: {}, policy: 'NONE',
        toolResult: { needsTool: false }, preprocessed: { relevantMemory }, capabilityRuntime: {
            model: { provider: 'ollama', model: 'fixture-model' },
            tts: { enabled: true, provider: 'kokoro', voice: 'fixture-voice', health: 'unavailable', checkedAt: '2026-09-14T00:00:00Z' }
        } });
    assert(prompt.includes('ollama/fixture-model'));
    assert(prompt.includes('voice fixture-voice; last observed health unavailable'));
    assert(prompt.includes('TTS [planned] (record updated: 2025-01-01T00:00:00Z)'));
    assert(prompt.includes('entries may be outdated'));
    assert(prompt.includes('Qwen generates text; it is not the active TTS'));
    assert(!prompt.includes('ATLAS OS WORLD MODEL'));
    assert(!prompt.includes('deleteNote(filename)'), 'Voice question should not inject the full tool catalogue');
    assert(prompt.includes('Alice, a calm, precise AI companion'), 'Operating questions keep the concise character voice');

    // dev_state remains retrievable even on the normal conversation route.
    const cache = require('../src/core/memoryCache');
    cache.getMemory = async store => store === 'dev_state'
        ? [{ id: 1, score: 0, data: { id: 1, ...relevantMemory.features[0] } }] : [];
    require('../src/memory/projectRegistry').getAllProjects = async () => [];
    const context = await require('../src/core/contextManager').getRelevantContext(
        'Explain your TTS pipeline', [], { intent: 'conversation' },
        { sessionId: 100, workingMemory: { getRelevant: async () => [] } });
    assert.equal(context.features.length, 1);
    assert.equal(context.features[0].updated_at, '2025-01-01T00:00:00Z');
    const unavailable = await require('../src/core/contextManager').getRelevantContext(
        'Explain your TTS pipeline', [], { intent: 'conversation' },
        { sessionId: 100, workingMemory: { getRelevant: async () => { throw new Error('502 Bad Gateway'); } } });
    assert.equal(unavailable.conversationHistoryStatus, 'unavailable');
    assert.deepEqual(unavailable.conversationHistory, []);
    console.log('Capability contracts, topic selection, runtime/config separation and dated dev_state passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
