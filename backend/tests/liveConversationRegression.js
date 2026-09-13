// Live local-model regression for the response path used by Alice.
// Run manually with: node tests/liveConversationRegression.js
// Requires an installed Ollama model. Uses isolated context and no Supabase/TTS.

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const assert = require('assert');
const databasePath = require.resolve('../src/database/supabaseClient');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true,
    exports: new Proxy({}, { get() { return () => { throw new Error('Production database access is forbidden in this regression.'); }; } }) };
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
    if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama requests are allowed.');
    return originalFetch(url, options);
};
const { buildContext } = require('../src/core/contextBuilder');
const { getDefaultModel } = require('../src/models/modelRouter');
const { getReasoningOptions } = require('../src/reasoning/controller');
const { getResponseStyle } = require('../src/response/controller');
const { inferMode } = require('../src/core/personalityEngine');
const { ThinkFilter } = require('../src/utils/thinkFilter');
const ollama = require('../src/models/providers/ollama');
const { removeThinkingTraces } = require('../src/response/processor');
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
    if (args[index] === '--model' && args[index + 1] && !args[index + 1].startsWith('--')) index++;
    else if (args[index] !== '--no-thinking') throw new Error('Use optional --model <installed-model> and --no-thinking.');
}
const modelIndex = args.indexOf('--model');
const model = modelIndex >= 0 ? args[modelIndex + 1] : getDefaultModel().model;
const results = [];

function relevantMemory(overrides = {}) {
    return {
        hotState: { activeProject: 'atlas', activeFiles: [], currentTask: null },
        state: [],
        personal: [],
        projects: [],
        projectNames: { atlas: 'Atlas' },
        activeProjectKey: 'atlas',
        knowledge: [],
        procedures: [],
        features: [],
        reflections: [],
        conversationHistory: [],
        ...overrides
    };
}

async function generate({ name, userInput, history = [], intentName = 'conversation', memory = relevantMemory(), toolResult = { needsTool: false }, expected, forbidden }) {
    const intent = { intent: intentName };
    const reasoning = {
        ...getReasoningOptions(intent, null, userInput, model),
        ...(args.includes('--no-thinking') ? { think: false } : {}),
        model,
        keepAlive: '30m'
    };
    const context = await buildContext({
        mode: inferMode(intent),
        intent,
        responseStyle: getResponseStyle(intent),
        toolResult,
        userInput,
        history,
        policy: reasoning.policy,
        workingContext: {},
        sessionId: 'live-regression',
        preprocessed: { relevantMemory: memory }
    });

    // The recent dialogue is sent as chat messages by conversationEngine;
    // append the current message here to mirror that path.
    const messages = [
        { role: 'system', content: context },
        ...history,
        { role: 'user', content: userInput }
    ];
    const filter = new ThinkFilter({ requestId: name });
    let answer = '';
    let doneReason = null;
    let thinkingChars = 0;
    let rawContent = '';
    let firstVisibleMs = null;
    const started = Date.now();

    for await (const chunk of ollama.streamComplete(messages, { ...reasoning, requestId: `live:${name}` })) {
        if (chunk.type === 'thinking') thinkingChars += chunk.text.length;
        if (chunk.type === 'content') {
            rawContent += chunk.text;
            const visible = filter.push(chunk.text);
            if (visible && firstVisibleMs === null) firstVisibleMs = Date.now() - started;
            answer += visible;
        }
        if (chunk.type === 'done') doneReason = chunk.doneReason;
    }
    answer += filter.finalize();
    answer = answer.trim();
    if (answer && firstVisibleMs === null) firstVisibleMs = Date.now() - started;
    const record = { name, model, policy: reasoning.policy, think: reasoning.think, temperature: reasoning.temperature,
        maxTokens: reasoning.maxTokens, expected: String(expected), forbidden: forbidden ? String(forbidden) : null, messages,
        answer, rawContent, thinkingChars, doneReason, firstVisibleMs, durationMs: Date.now() - started, passed: false };
    results.push(record);

    assert(answer, `${name}: model returned no visible answer (done_reason=${doneReason})`);
    assert(!/^\s*(?:i need to|let me|the user asked|my task is)\b/i.test(answer), `${name}: leaked planning: ${answer}`);
    assert(!/final response:/i.test(answer), `${name}: final marker reached the user: ${answer}`);
    assert(!/<\/?think>|<\|(?:analysis|channel|message)/i.test(answer), `${name}: thinking/channel markup reached the user`);
    assert.strictEqual(doneReason, 'stop', `${name}: reply did not finish within its configured budget`);
    assert(removeThinkingTraces(answer).trim(), `${name}: final response cleanup erased the visible reply`);
    assert(expected.test(answer), `${name}: unexpected answer: ${answer}`);
    if (forbidden) assert(!forbidden.test(answer), `${name}: unwanted claim or topic: ${answer}`);
    assert(context.length < 14000, `${name}: system context regressed to ${context.length} characters`);
    record.passed = true;

    console.log(`✓ ${name} (${context.length} prompt chars, done=${doneReason})`);
    console.log(`  ${answer.replace(/\s+/g, ' ').slice(0, 240)}`);
    return answer;
}

async function check(test) {
    try { return await generate(test); }
    catch (error) {
        const record = results.find(result => result.name === test.name);
        if (record) record.error = error.message;
        else results.push({ name: test.name, passed: false, error: error.message });
        console.error(error.message);
    }
}

async function run() {
    const history = [
        { role: 'user', content: 'Our current latency test subject is reflection retrieval.' },
        { role: 'assistant', content: 'Understood. The current latency test subject is reflection retrieval.' }
    ];

    await check({
        name: 'recent-turn recall',
        userInput: 'What is our current latency test subject?',
        history,
        expected: /reflection retrieval/i
    });

    await check({
        name: 'project decision retrieval',
        userInput: 'Briefly explain our raw-chat recall decision.',
        memory: relevantMemory({
            projects: [{
                project_key: 'atlas', subject: 'memory', key: 'raw_chat_recall_decision',
                value: 'Raw chat recall remains session-scoped; cross-session continuity uses reflections.'
            }]
        }),
        expected: /session[- ](?:scoped|specific)|within (?:each|a single|the) session|scoped to (?:the )?current session/i,
        forbidden: /privacy|storage costs|less sensitive/i
    });

    await check({
        name: 'memory explanation',
        userInput: 'Explain the difference between working memory and project memory.',
        memory: relevantMemory({
            knowledge: [
                { category: 'atlas', subject: 'memory', key: 'working_memory', value: 'Temporary current-session conversation state.' },
                { category: 'atlas', subject: 'memory', key: 'project_memory', value: 'Durable facts and decisions scoped to one registered project.' }
            ]
        }),
        expected: /working memory[\s\S]*project memory|project memory[\s\S]*working memory/i
    });

    await check({
        name: 'grounded current search synthesis',
        userInput: 'Search the web for the latest stable Ollama release and summarize the important changes.',
        intentName: 'search',
        toolResult: {
            needsTool: true,
            toolName: 'search_web',
            toolResult: 'SEARCH_STATUS: RESULTS_FOUND\n--- Source material 1 ---\nOfficial release evidence for this regression fixture: Ollama v9.9.9 is the latest stable release. It adds fixture streaming improvements and fixture reliability fixes.'
        },
        expected: /9\.9\.9/i
    });

    await check({ name: 'short instruction', userInput: 'Reply with exactly: Ready.', expected: /^Ready\.$/ });
    await check({ name: 'planning response', intentName: 'planning',
        userInput: 'Give a brief three-step plan for adding a read-only memory inspection screen. Do not claim you have implemented it.',
        expected: /(?:read.only|inspect)/i });

    // Deliberately keep populated Atlas background while the subject changes.
    // These checks catch topic hijacking that empty-context smoke tests miss.
    // No memory extraction or persistence runs here, including for playful text.
    const background = relevantMemory({
        projects: [{ project_key: 'atlas', subject: 'database', key: 'memory_backend',
            value: 'Supabase stores durable Atlas memories.' }],
        personal: [],
        procedures: [{ trigger: 'Making a change', action: 'Validate the affected behavior.' }]
    });
    const factHistory = [];
    for (const [index, statement] of [
        'SQLite is an in-process database library.',
        "SQLite is a database library that runs within its host application's process."
    ].entries()) {
        const reply = await check({ name: `general fact with project background ${index + 1}`,
            userInput: statement, history: [...factHistory], memory: background,
            expected: /SQLite|in.process|embedded|correct|accurate|right|exactly/i,
            forbidden: /\b(?:Atlas|Supabase|project memory|misconception)\b|not (?:entirely )?accurate|out.of.process modes/i });
        factHistory.push({ role: 'user', content: statement });
        if (reply) factHistory.push({ role: 'assistant', content: reply });
    }
    await check({ name: 'persistence with project background', memory: background,
        userInput: 'Does a normal file-backed SQLite database lose its stored data when the application closes?',
        expected: /\bno\b|persist|remain|retain|does(?:n.t| not) (?:lose|disappear)/i,
        forbidden: /\b(?:Atlas|Supabase)\b/i });
    await check({ name: 'unknown project rationale', memory: background,
        userInput: 'Do you remember my actual reason for choosing Supabase for Atlas? I am asking for the recorded reason, not possible benefits.',
        expected: /(?:don.t|do not|no|not|isn.t|is not|lack|missing|wasn.t|unavailable)[\s\S]*(?:reason|record|memory|remember)|reason[\s\S]*(?:missing|not|unavailable)/i,
        forbidden: /reflection (?:only notes|says|shows)|you (?:chose|selected) it because/i });
    await check({ name: 'casual inference allowed', memory: background,
        userInput: 'Sometimes taking a walk makes a programming problem click. What is your guess about why that happens?',
        expected: /guess|might|may|probably|perhaps|suspect|likely|could|think/i,
        forbidden: /cannot speculate|can.t speculate|need verified evidence|\bSupabase\b/i });
    await check({ name: 'dry humor allowed', memory: background,
        userInput: 'Give me a dry one-line joke about debugging a missing semicolon.',
        expected: /semicolon|punctuation|;|character|compiler|sentence/i,
        forbidden: /cannot joke|can.t joke|verify|verified evidence|\bSupabase\b/i });
    const output = path.resolve(__dirname, '../.local/conversation-validations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const summary = { model, total: results.length, passed: results.filter(result => result.passed).length };
    fs.writeFileSync(output, JSON.stringify({ mode: 'isolated_context_local_model', summary, results }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...summary, report: output }, null, 2));
    if (summary.passed !== summary.total) process.exitCode = 1;
}

run().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
