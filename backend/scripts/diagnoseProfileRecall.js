// Read the real profile once, then isolate context assembly and local Ollama.
// No conversation engine, background extraction, tool execution or DB writes.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const profile = require('../src/memory/longTermProfile');
const cache = require('../src/core/memoryCache');
const registry = require('../src/memory/projectRegistry');
const worldModel = require('../src/memory/worldModel');
const { getRelevantContext } = require('../src/core/contextManager');
const { buildContext } = require('../src/core/contextBuilder');
const ollama = require('../src/models/providers/ollama');
const { getDefaultModel } = require('../src/models/modelRouter');

async function main() {
    const rows = await profile.get();
    const fetch = globalThis.fetch;
    globalThis.fetch = (url, options) => {
        if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama allowed after profile read');
        return fetch(url, options);
    };
    const indexed = rows.map(data => ({ id: data.id, data, score: 0 }));
    cache.getMemory = async store => store === 'user_profile' ? indexed : [];
    registry.getAllProjects = async () => [];
    worldModel.getAll = async () => [];
    const messages = [
        "Yeah that sounds good. Let's do some quick tests on some things you should already know. What all do you remember about me?",
        "That's good, anything else you remember about me?",
        'What about some other of my favorite things?'
    ];
    const history = [];
    const report = { mode: 'read_only_profile_isolated_context_local_model', model: getDefaultModel().model, results: [] };
    const output = path.resolve(__dirname, '../.local/profile-recall-evaluations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    for (const userInput of messages) {
        const context = await getRelevantContext(userInput, history, { intent: 'conversation' });
        const prompt = await buildContext({ mode: 'casual', intent: { intent: 'conversation' },
            userInput, history, workingContext: {}, policy: 'NONE', toolResult: { needsTool: false },
            preprocessed: { relevantMemory: context }
        });
        const response = await ollama.complete([{ role: 'system', content: prompt }, ...history,
            { role: 'user', content: userInput }], { ...getDefaultModel(), think: false, temperature: 0, num_predict: 700 });
        const record = { userInput, coverage: context.profileCoverage,
            selectedKeys: context.personal.map(row => row.key), response };
        report.results.push(record);
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(JSON.stringify(record));
        history.push({ role: 'user', content: userInput }, { role: 'assistant', content: response });
    }
    console.log(`Report: ${output}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
