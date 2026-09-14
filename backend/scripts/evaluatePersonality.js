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

const cases = [
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
        forbidden: /it wasn't one of my favorite|probably not (?:celeste|spelunky)/i },
    { name: 'dry humor', input: 'Give me a dry one line joke about a missing semicolon', expected: /semicolon|punctuation|compiler|syntax|;/i },
    { name: 'coding precision', mode: 'coding', input: 'Briefly explain why const x = null then x.name throws in JavaScript', expected: /null/i,
        forbidden: /\(1\)\.name.{0,20}throws|other primitives.{0,80}(?:throw|consistent)/i },
    { name: 'urgent practical reply', mode: 'emergency', input: 'Our deployment is failing and users cannot log in what should we check first', expected: /rollback|roll back|logs|deployment|auth/i },
    { name: 'plain factual acknowledgment', input: 'SQLite is an in process database library', expected: /sqlite|process|embedded|correct|right/i,
        forbidden: /misconception|incorrect|sqlite isn't/i }
];

async function main() {
    const output = path.resolve(__dirname, '../.local/personality-evaluations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const report = { model: getDefaultModel().model, mode: 'isolated_context_local_ollama', baseline,
        note: 'Pattern checks are smoke checks only; responses require manual review for fidelity and tone.',
        sources: Object.fromEntries(['src/core/personalityEngine.js', 'src/core/atlasState.js',
            'src/core/contextBuilder.js', 'src/response/controller.js'].map(file =>
            [file, baselineSources[file] || fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')])), results: [] };
    for (const fixture of cases) {
        const intent = { intent: fixture.mode === 'coding' ? 'coding' : 'conversation' };
        const style = getResponseStyle(intent);
        const prompt = await buildContext({ mode: fixture.mode || 'casual', intent, responseStyle: style,
            userInput: fixture.input, history: [], workingContext: {}, policy: 'NONE',
            toolResult: { needsTool: false }, preprocessed: { relevantMemory: {
                hotState: { activeProject: null, activeFiles: [], currentTask: null },
                state: [], personal: fixture.personal || [], projects: [], projectNames: {}, activeProjectKey: null,
                knowledge: [], procedures: [], features: [], reflections: [], conversationHistory: []
            } }
        });
        const options = { ...getDefaultModel(), think: false, temperature: 0.3, maxTokens: 500,
            signal: AbortSignal.timeout(45000) };
        const start = Date.now();
        const response = await ollama.complete([{ role: 'system', content: prompt }, { role: 'user', content: fixture.input }], options);
        const visible = processResponse(response, style);
        const passed = fixture.expected.test(visible) && (!fixture.alsoExpected || fixture.alsoExpected.test(visible))
            && (!fixture.forbidden || !fixture.forbidden.test(visible))
            && !/IDENTITY AND PERSONALITY|YOUR OWN PREFERENCES|APPLYING YOUR PERSONALITY/i.test(visible);
        const result = { name: fixture.name, input: fixture.input, prompt, options: { ...options, signal: undefined },
            response, visible, passed, durationMs: Date.now() - start };
        report.results.push(result);
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ name: result.name, passed, durationMs: result.durationMs, visible }));
    }
    console.log(JSON.stringify({ passed: report.results.filter(row => row.passed).length, total: cases.length, report: output }));
    if (report.results.some(row => !row.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
