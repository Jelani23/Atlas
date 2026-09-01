// Live local-model regression for the response path used by Alice.
// Run manually with: node tests/liveConversationRegression.js
// Requires Ollama and qwen3:4b. It intentionally avoids Supabase and TTS.

require('dotenv').config();
const assert = require('assert');
const { buildContext } = require('../src/core/contextBuilder');
const { getReasoningOptions } = require('../src/reasoning/controller');
const { getResponseStyle } = require('../src/response/controller');
const { ThinkFilter } = require('../src/utils/thinkFilter');
const ollama = require('../src/models/providers/ollama');

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

async function generate({ name, userInput, history = [], intentName = 'conversation', memory = relevantMemory(), toolResult = { needsTool: false }, expected }) {
    const intent = { intent: intentName };
    const reasoning = {
        ...getReasoningOptions(intent, null, userInput),
        model: 'qwen3:4b',
        keepAlive: '30m'
    };
    const context = await buildContext({
        mode: intentName === 'search' ? 'research' : 'casual',
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

    for await (const chunk of ollama.streamComplete(messages, { ...reasoning, requestId: `live:${name}` })) {
        if (chunk.type === 'content') answer += filter.push(chunk.text);
        if (chunk.type === 'done') doneReason = chunk.doneReason;
    }
    answer += filter.finalize();
    answer = answer.trim();

    assert(answer, `${name}: model returned no visible answer (done_reason=${doneReason})`);
    assert(!/^\s*(?:i need to|let me|the user asked|my task is)\b/i.test(answer), `${name}: leaked planning: ${answer}`);
    assert(!/final response:/i.test(answer), `${name}: final marker reached the user: ${answer}`);
    assert(expected.test(answer), `${name}: unexpected answer: ${answer}`);
    assert(context.length < 14000, `${name}: system context regressed to ${context.length} characters`);

    console.log(`✓ ${name} (${context.length} prompt chars, done=${doneReason})`);
    console.log(`  ${answer.replace(/\s+/g, ' ').slice(0, 240)}`);
    return answer;
}

async function run() {
    const history = [
        { role: 'user', content: 'Our current latency test subject is reflection retrieval.' },
        { role: 'assistant', content: 'Understood. The current latency test subject is reflection retrieval.' }
    ];

    await generate({
        name: 'recent-turn recall',
        userInput: 'What is our current latency test subject?',
        history,
        expected: /reflection retrieval/i
    });

    await generate({
        name: 'project decision retrieval',
        userInput: 'Briefly explain our raw-chat recall decision.',
        memory: relevantMemory({
            projects: [{
                project_key: 'atlas', subject: 'memory', key: 'raw_chat_recall_decision',
                value: 'Raw chat recall remains session-scoped; cross-session continuity uses reflections.'
            }]
        }),
        expected: /session[- ](?:scoped|specific)|within each session/i
    });

    await generate({
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

    await generate({
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

    console.log('\nAll live Alice response regressions passed.');
}

run().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
