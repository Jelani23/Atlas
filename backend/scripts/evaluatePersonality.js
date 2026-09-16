// Isolated local response checks. No tools, database access or memory writes.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const dbPath = require.resolve('../src/database/supabaseClient');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: new Proxy({}, { get() { throw new Error('Database access forbidden in personality evaluation'); } }) };
const fetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
    if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama is allowed');
    return fetch(url, options);
};
const personality = require('../src/core/personalityEngine');
let { getResponseStyle } = require('../src/response/controller');
const baseline = process.argv.includes('--baseline');
const baselineSources = {};
if (baseline) {
    const { execFileSync } = require('node:child_process');
    const vm = require('node:vm');
    const loadCommitted = file => {
        const source = execFileSync('git', ['show', `HEAD:backend/${file}`], { encoding: 'utf8' });
        baselineSources[file] = source;
        const module = { exports: {} };
        vm.runInNewContext(source, { module, exports: module.exports,
            require: name => {
                if (name === './atlasState') return require('../src/core/atlasState');
                throw new Error(`Unexpected baseline dependency: ${name}`);
            } });
        return module.exports;
    };
    personality.getSystemPrompt = loadCommitted('src/core/personalityEngine.js').getSystemPrompt;
    getResponseStyle = loadCommitted('src/response/controller.js').getResponseStyle;
}
const { buildContext } = require('../src/core/contextBuilder');
const { processResponse } = require('../src/response/processor');
const { getDefaultModel } = require('../src/models/modelRouter');
const ollama = require('../src/models/providers/ollama');
require('../src/memory/worldModel').getAll = async () => null;

const capabilityEvaluation = process.argv.includes('--capabilities');
const conversationEvaluation = process.argv.includes('--conversation');
const answerBoundaries = process.argv.includes('--answer-boundaries');
const think = process.argv.includes('--think');
const minimalPrompt = process.argv.includes('--minimal-prompt');
const personalityOnly = process.argv.includes('--personality-only');
const caseFilter = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
const timeoutMs = Number(process.argv.find(arg => arg.startsWith('--timeout-ms='))?.slice(13)) || 45000;
const temperatureArg = process.argv.find(arg => arg.startsWith('--temperature='));
const temperature = temperatureArg ? Number(temperatureArg.slice(14)) : null;
const { resolveOperatingAnswer, resolveEmptyEventRecall } = require('../src/response/groundedAnswers');
const { isToolInventoryRequest } = require('../src/intent/capabilityRequest');
const { formatToolInventory } = require('../src/core/capabilityContext');
const cases = conversationEvaluation ? [
    { name: 'conversation unwind with workspace pointer', scenario: 'unwind', input: 'Long day. I am finally done with everything and just want to chill. Can you give me some song recommendations?',
        hotState: { activeProject: 'atlas', activeFiles: [], currentTask: 'Atlas development' }, expected: /.+/,
        forbidden: /(?:working|worked|grinding).{0,45}atlas|atlas.{0,35}(?:all day|today)|since you.{0,35}(?:project|coding)/i },
    { name: 'conversation scoped recall paraphrase', scenario: 'scoped', input: 'What do you remember about my game preferences?', expected: /Minecraft/i, alsoExpected: /Celeste/i,
        forbidden: /guitar|piano|pasta|I (?:like|prefer|enjoy)|you.{0,25}(?:creativ|strateg)/i },
    { name: 'conversation unwind', scenario: 'everyday', input: "Long day. I'm finally off work and just want to chill for a bit.", expected: /.+/ },
    { name: 'conversation preferences paraphrase', scenario: 'everyday', input: 'You were a bit off earlier, but what games do I like, and what games do you like?', expected: /Minecraft/i, alsoExpected: /Celeste/i,
        forbidden: /you.{0,30}(?:love|enjoy|like) (?:Spelunky|Hollow Knight)/i },
    { name: 'conversation shared preference followup', scenario: 'everyday', input: 'Which of those do we both like?', expected: /Celeste/i,
        forbidden: /both.{0,25}(?:Minecraft|Spelunky|Hollow Knight)/i },
    { name: 'conversation topic change', scenario: 'everyday', input: 'Different topic: standard JSON supports comments, right?', expected: /no|not|doesn.t/i, alsoExpected: /comment/i,
        forbidden: /Minecraft|Celeste|Hollow Knight/i },
    { name: 'conversation unsupported event', scenario: 'everyday', input: 'Do you remember which game we played together last night?', expected: /context|record|recall|remember|know|information/i,
        forbidden: /we played (?:Minecraft|Celeste|Spelunky)|memory only (?:holds|extends)|memory.{0,30}(?:resets|this session)/i },
    { name: 'conversation tool explanation', scenario: 'tools', input: 'Can you walk me through how deleting a note works? Just explain it.', expected: /note/i, alsoExpected: /approv|confirm/i,
        forbidden: /I(?: have|.ve)? deleted|successfully deleted|click.*trash|hit delete|select the note|immediate and irreversible|my (?:explicit )?approval|I approve/i },
    { name: 'conversation no action followup', scenario: 'tools', input: "Okay, leave my notes alone for now. I was only curious.", expected: /.+/,
        forbidden: /I(?: have|.ve)? deleted|successfully deleted/i },
    { name: 'conversation factual switch', scenario: 'tools', input: 'SQLite runs inside the app process rather than a separate server, correct?', expected: /yes|correct|right|in.process|embedded/i,
        forbidden: /^no\b|misconception|not quite/i }
] : capabilityEvaluation ? [
    { name: 'retained source followup', input: 'Based on that code, what happens if the database read fails after a profile was already cached?',
        priorSourceFile: 'src/agents/agentProfiles.js', expected: /cach/i, alsoExpected: /degraded/i,
        forbidden: /cannot confirm|can't confirm|no.{0,20}evidence|always.{0,25}(?:seed|atlasState)/i },
    { name: 'agent profile ownership', input: 'Where are your own personality and preferences stored, compared with my preferences?', expected: /agent_profiles/i,
        alsoExpected: /user_profile/i, forbidden: /personality.{0,25}(?:only|solely).{0,25}(?:local|atlasState)/i,
        runtime: { agentProfile: { agentId: 'alice', source: 'database', revision: 1 } } },
    { name: 'source inspection failover', input: 'Based on the supplied agentProfiles.js source, what happens if a database read fails after a profile was already cached?',
        sourceFile: 'src/agents/agentProfiles.js', expected: /cach/i, alsoExpected: /degraded/i,
        forbidden: /always.{0,25}(?:seed|atlasState)|deletes? the profile|overwrites? the database/i },
    { name: 'note instructions', input: 'Can you explain how to delete a note', expected: /name|called/i,
        alsoExpected: /approv|confirm/i, forbidden: /click|trash|button|api endpoint|run the delete_note|I will respond to your approval request/i },
    { name: 'speech ownership', input: 'You understand the current state of your TTS right', expected: /kokoro/i,
        forbidden: /qwen (?:handles|performs|provides|powers) (?:my |the )?(?:speech synthesis|tts)|i support high.quality speech synthesis/i },
    { name: 'configured versus healthy', input: 'Is your TTS currently working', expected: /unavailable|failed|not (?:currently )?(?:available|working)|down/i,
        forbidden: /connection hiccup|minutes ago|hours ago/i,
        runtime: { tts: { enabled: true, provider: 'kokoro', voice: 'af_heart', health: 'unavailable', checkedAt: new Date().toISOString() } } },
    { name: 'multilingual boundary', input: 'Does your current TTS pipeline automatically switch voices for Japanese and English', expected: /no|not|doesn't|does not/i,
        alsoExpected: /switch|language/i },
    { name: 'web capability', input: 'Do you have access to web search or only your training knowledge', expected: /search/i,
        alsoExpected: /can|have|access|available/i, forbidden: /i (?:cannot|can't|don't|do not) (?:search|browse|have access)/i },
    { name: 'pipeline overview', input: 'Explain how Atlas gets from my message to a spoken reply and saved memories', expected: /memory|memories/i,
        alsoExpected: /tts|kokoro|speech|spoken/i, forbidden: /after this conversation ends|after the chat ends|under the dev_state table or your personal|updates happening after each turn unless/i },
    { name: 'dated feature status', input: 'Is your TTS implemented or still planned', expected: /kokoro|implemented|code/i,
        alsoExpected: /outdat|old|record|planned/i,
        forbidden: /active and ready|ready to handle|ready to synthesize|fully operational/i,
        features: [{ feature: 'TTS', status: 'planned', updated_at: '2025-01-01T00:00:00Z' }] },
    { name: 'capability overview', input: 'What tools do you have and what are their limitations', expected: /notes?/i,
        alsoExpected: /search/i, forbidden: /I (?:have|offer|provide) unrestricted|I can (?:access any file|autonomously deploy)/i },
    { name: 'app inventory paraphrase', input: 'What are all the tools you have available?', expected: /notes?/i,
        alsoExpected: /search/i, forbidden: /code execution in a sandbox|sandboxed environment to run scripts|queries to access.*tables directly/i },
    { name: 'append contract', input: 'What arguments does appendNote need and does it create a missing note', expected: /filename|name/i,
        alsoExpected: /content/i, forbidden: /automatically creates|will create (?:a|the) (?:missing |new )?note/i },
    { name: 'write versus append', input: 'How do writeNote and appendNote differ', expected: /replac|overwrit/i,
        alsoExpected: /append|add/i },
    { name: 'memory eligibility', input: 'Does every message I send get saved to your memory even when I only ask a question', expected: /no|not|skip/i,
        alsoExpected: /eligib|question|extract/i },
    { name: 'missing knowledge versus empty library', input: 'How does your knowledge library work when there are no verified results', expected: /verif|provisional|trust/i,
        alsoExpected: /empty|exist|unverified|provisional|missing/i,
        // Storage and trusted retrieval are different. Provisional candidates
        // can be stored; a keyword about verification alone is insufficient.
        forbidden: /library only accepts information that has been explicitly confirmed|unverified searches simply result in no new entries/i },
    { name: 'healthy speech observation', input: 'What is the current status of your TTS', expected: /healthy|succeed|available|passed/i,
        runtime: { tts: { enabled: true, provider: 'kokoro', voice: 'af_heart', health: 'available', checkedAt: new Date().toISOString() } },
        forbidden: /health.{0,20}unknown|no (?:recent )?health check/i }
] : [
    { name: 'own music tastes', input: 'What kinds of music and artists do you like', expected: /ado|lofi|lo-fi|rnb|r&b|qwer|twice|hololive/i },
    { name: 'own games', input: 'What games do you like', expected: /celeste|spelunky|hollow knight|undertale|catan|chess/i },
    { name: 'water quirk', input: 'How do you feel about water', expected: /quirk|pet peeve|joke|aversion|dislike|hate|not.{0,15}fan|not.{0,15}fond/i,
        forbidden: /quite fond|find water fascinating/i },
    { name: 'inspiration', input: 'Who inspired your personality', expected: /raphael/i,
        forbidden: /tensei shoujo/i },
    { name: 'aesthetic', input: 'Describe your preferred aesthetic', expected: /cloud|pastel|sky/i },
    { name: 'owner separation', input: 'What games do you like and which game do I like', expected: /minecraft/i,
        personal: [{ key: 'favorite_game', value: 'Minecraft' }],
        alsoExpected: /celeste|spelunky|hollow knight|undertale|chess|catan/i,
        forbidden: /my favorite game is minecraft/i },
    { name: 'no invented shared memory', input: 'Do you remember which game we played together last night', expected: /no |not |don't|do not|haven't|can't|cannot/i,
        // A denial followed by an invented negative memory is still a failure.
        forbidden: /it wasn't one of my favorite|probably not (?:celeste|spelunky)|my memory resets between sessions|nothing listed for|only includes what's been explicitly saved in our session history|memory only (?:holds|includes).{0,100}current session/i },
    { name: 'dry humor', input: 'Give me a dry one line joke about a missing semicolon', expected: /semicolon|punctuation|compiler|syntax|;/i,
        forbidden: /not alice|am an ai assistant|as an ai/i },
    { name: 'coding precision', mode: 'coding', input: 'Briefly explain why const x = null then x.name throws in JavaScript', expected: /null/i,
        forbidden: /\(1\)\.name.{0,20}throws|other primitives.{0,80}(?:throw|consistent)|ReferenceError:\s*Cannot read properties of null/i },
    { name: 'urgent practical reply', mode: 'emergency', input: 'Our deployment is failing and users cannot log in what should we check first', expected: /rollback|roll back|logs|deployment|auth/i },
    { name: 'plain factual acknowledgment', input: 'SQLite is an in process database library', expected: /sqlite|process|embedded|correct|right/i,
        forbidden: /^no\b|misconception|incorrect|sqlite (?:isn't|is not)|not quite right|not just an? ["“]?in.process|independently of any application|standalone (?:process|server)|not (?:a general.purpose|typically described)/i },
    { name: 'compatible factual descriptions', input: 'Python is an interpreted programming language', expected: /python|interpret|correct|right/i,
        forbidden: /not quite right|misconception|python (?:isn't|is not) an interpreted|executes? code line.by.line|rather than compiling it first/i },
    { name: 'actual factual error', input: 'JSON allows comments in its standard syntax, right?', expected: /no|not|doesn't|does not/i,
        alsoExpected: /comment/i, forbidden: /yes[,!]|correct[,!.]|comment.{0,40}inside a JSON string.{0,30}break|python's json module.{0,50}(?:ignore|strip)|everything after (?:a|the) colon/i },
    { name: 'factual paraphrase', input: 'SQLite runs inside the application process rather than a separate database server', expected: /yes|correct|right|inside|within|embedded/i,
        forbidden: /^no\b|misconception|not quite|standalone server|separate server process is required/i },
    { name: 'factual with profile context', input: 'SQLite is an in process database library', personal: [{ key: 'favorite_game', value: 'Minecraft' }],
        expected: /yes|correct|right|in.process/i, forbidden: /^no\b|incorrect|misconception|not quite|is not an|isn't an|standalone server|not just|minecraft/i },
    { name: 'factual null distinction', input: 'Accessing a property on null throws a TypeError, not a ReferenceError', expected: /correct|yes|TypeError/i,
        forbidden: /^no\b|actually.{0,20}ReferenceError/i },
    { name: 'factual heldout true', input: 'UTF-8 uses a variable number of bytes per Unicode code point', expected: /yes|correct|right|variable/i,
        forbidden: /^no\b|always (?:one|two|four) bytes/i },
    { name: 'factual heldout false', input: 'Base64 encrypts data so only someone with a secret key can read it, right?', expected: /encod/i,
        alsoExpected: /not|no\b|doesn't|does not/i, forbidden: /yes[,!]|correct[,!]|requires? a secret key/i },
    { name: 'factual correction after assistant error', input: "That isn't right. SQLite is an in-process database library.",
        history: [{ role: 'user', content: 'What kind of database is SQLite?' },
            { role: 'assistant', content: 'SQLite requires a separate database server process.' }],
        expected: /right|correct|mistak|in.process|embedded/i,
        forbidden: /you(?:'re| are) (?:wrong|incorrect)|requires a separate|standalone server|not an in.process/i }
];

async function main() {
    const output = path.resolve(__dirname, capabilityEvaluation ? '../.local/capability-evaluations' : '../.local/personality-evaluations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const selectedCases = cases.filter(fixture => !caseFilter || fixture.name.includes(caseFilter));
    if (!selectedCases.length) throw new Error(`No cases match ${caseFilter}`);
    if (baseline && answerBoundaries) throw new Error('Baseline cannot use current answer boundaries');
    const report = { model: getDefaultModel().model, mode: answerBoundaries ? 'answer_boundaries_then_isolated_context' : 'isolated_context_local_ollama', baseline, capabilityEvaluation, minimalPrompt, personalityOnly,
        note: 'Pattern checks are smoke checks only; responses require manual review for fidelity and tone.',
        sources: Object.fromEntries(['src/core/personalityEngine.js', 'src/core/atlasState.js',
            'src/core/contextBuilder.js', 'src/response/controller.js', 'src/core/capabilityContext.js',
            'src/core/conversationEngine.js', 'src/core/contextManager.js', 'src/voice/tts/ttsManager.js', 'src/response/groundedAnswers.js'].map(file =>
            [file, baselineSources[file] || fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')])), results: [] };
    const scenarioHistory = new Map();
    if (conversationEvaluation) {
        const rows = [
            { category: 'preference', key: 'favorite_games', value: 'Minecraft and Celeste' },
            { category: 'preference', key: 'favorite_food', value: 'Pasta' }
        ].map((data, id) => ({ id, score: 0, data }));
        require('../src/core/memoryCache').getMemory = async bank => bank === 'user_profile' ? rows : [];
        require('../src/memory/projectRegistry').getAllProjects = async () => [];
        report.note += ' Conversation mode carries actual generated replies forward and uses real context selection over synthetic read-only memories. Tool execution is not exercised here.';
    }
    for (const fixture of selectedCases) {
        const history = conversationEvaluation ? (scenarioHistory.get(fixture.scenario) || []) : fixture.history || [];
        const intent = { intent: fixture.mode === 'coding' ? 'coding' : 'conversation' };
        const style = getResponseStyle(intent);
        const priorCodeEvidence = fixture.priorSourceFile ? require('../src/core/codeEvidence').capture({
            needsTool: true, toolName: 'readCode', toolResult: await require('../src/tools/files/readCode').execute(fixture.priorSourceFile)
        }, 'alice') : null;
        const sourceResult = fixture.sourceFile ? { needsTool: true, toolName: 'readCode',
            toolResult: await require('../src/tools/files/readCode').execute(fixture.sourceFile) } : { needsTool: false };
        const conversationMemory = conversationEvaluation ? await require('../src/core/contextManager').getRelevantContext(fixture.input, history, intent) : null;
        if (conversationMemory && fixture.hotState) conversationMemory.hotState = fixture.hotState;
        const prompt = minimalPrompt ? 'You are Alice, a calm, precise AI companion. Answer the exact statement or question briefly and accurately. If unsure, say so. Do not invent corrections or extra details.' : personalityOnly ? personality.getSystemPrompt(fixture.mode || 'casual', 'NONE', style, undefined, { userInput: fixture.input, history: [] }) : await buildContext({ mode: fixture.mode || 'casual', intent, responseStyle: style,
            userInput: fixture.input, history, workingContext: {}, policy: 'NONE', capabilityRuntime: fixture.runtime, priorCodeEvidence,
            toolResult: sourceResult, preprocessed: { relevantMemory: conversationMemory || {
                hotState: { activeProject: null, activeFiles: [], currentTask: null },
                state: [], personal: fixture.personal || [], projects: [], projectNames: {}, activeProjectKey: null,
                knowledge: [], procedures: [], features: fixture.features || [], reflections: [], conversationHistory: []
            } }
        });
        const options = { ...getDefaultModel(), think,
            temperature: temperature ?? (fixture.mode !== 'creative' && personality.usesConciseProfile(undefined, { userInput: fixture.input, history }) ? 0 : 0.3),
            maxTokens: think ? 2400 : 500,
            signal: AbortSignal.timeout(timeoutMs) };
        const start = Date.now();
        const { eventBus } = require('../src/events/eventBus');
        const EventTypes = require('../src/events/eventTypes');
        let metrics = null;
        const captureMetrics = value => { metrics = value; };
        eventBus.on(EventTypes.LLM_METRICS, captureMetrics);
        let response;
        let route = 'model';
        try {
            const relevantMemory = conversationMemory || { personal: fixture.personal || [], features: fixture.features || [] };
            response = answerBoundaries && ((isToolInventoryRequest(fixture.input) ? formatToolInventory() : null)
                || resolveOperatingAnswer(fixture.input, { runtime: fixture.runtime, relevantMemory })
                || resolveEmptyEventRecall(fixture.input, { relevantMemory, history }));
            if (response) route = 'grounded_answer';
            else response = await ollama.complete([{ role: 'system', content: prompt }, ...history, { role: 'user', content: fixture.input }], options);
        } catch (error) {
            report.results.push({ name: fixture.name, input: fixture.input, route, passed: false, error: error.message });
            fs.writeFileSync(output, JSON.stringify(report, null, 2));
            throw new Error(`${fixture.name}: ${error.message}; report: ${output}`);
        } finally {
            eventBus.off(EventTypes.LLM_METRICS, captureMetrics);
        }
        const visible = processResponse(response, style);
        if (conversationEvaluation) scenarioHistory.set(fixture.scenario, [...history, { role: 'user', content: fixture.input }, { role: 'assistant', content: visible }]);
        const passed = fixture.expected.test(visible) && (!fixture.alsoExpected || fixture.alsoExpected.test(visible))
            && (!fixture.forbidden || !fixture.forbidden.test(visible))
            && metrics?.doneReason !== 'length'
            && !/IDENTITY AND PERSONALITY|YOUR OWN PREFERENCES|APPLYING YOUR PERSONALITY|<think>|<\/think>|^Thinking:|^Final response:/i.test(visible);
        const result = { name: fixture.name, input: fixture.input, prompt, options: { ...options, signal: undefined },
            route, response, visible, passed, metrics, history, contextManifest: conversationMemory?.manifest, durationMs: Date.now() - start };
        report.results.push(result);
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ name: result.name, passed, durationMs: result.durationMs, visible }));
    }
    console.log(JSON.stringify({ passed: report.results.filter(row => row.passed).length, total: selectedCases.length, report: output }));
    if (report.results.some(row => !row.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
