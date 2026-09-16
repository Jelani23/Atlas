// Read-only behavioral audit. Fixtures and tool calls stay in this process.
// Exit 1 means the audit found an unmet expectation, not that tools ran live.
const fs = require('node:fs');
const path = require('node:path');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-audit';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => { throw new Error('Network forbidden in reliability boundary audit'); };
const dbPath = require.resolve('../src/database/supabaseClient');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: new Proxy({}, { get() { throw new Error('Database forbidden in reliability boundary audit'); } }) };
const toolCalls = [];
require('../src/tools/toolExecutor').execute = async (tool, args) => {
    toolCalls.push({ tool, args });
    return 'Offline simulated result';
};
require('../src/planner/searchPipeline').executeSearch = async () => { throw new Error('Search forbidden in audit'); };
const { resolve } = require('../src/intent/intentResolver');
const { route } = require('../src/planner/planner');
const state = require('../src/planner/state');
const { getKnowledgeOverviewTopic } = require('../src/memory/knowledgeRequest');
const { isToolInventoryRequest } = require('../src/intent/capabilityRequest');
const { resolveProfileRecall } = require('../src/memory/profileRecall');

async function main() {
    const results = [];
    function record(area, input, expected, actual) {
        results.push({ area, input, expected, actual, passed: expected === actual });
    }
    for (const input of ['What do you know about Neuro sama', 'What do you know about Neuro-sama',
        'Can you tell me about Neuro sama', 'Tell me about Neuro sama please',
        'Can you tell me who Neuro sama is', 'Who is Neuro sama']) {
        record('factual overview guard coverage', input, true, !!getKnowledgeOverviewTopic(input));
    }
    for (const input of ['What are all the tools you have available', 'Which tools are available to you',
        'Could you give me a list of your tools', 'Tell me what tools you can use']) {
        record('executable inventory coverage', input, true, isToolInventoryRequest(input));
    }
    for (const input of ['What are my favorite games', 'What games do I like', 'Remind me of my favorite game']) {
        record('explicit profile recall coverage', input, true, !!resolveProfileRecall(input));
    }
    const profileHistory = [{ role: 'user', content: 'What do you remember about me' },
        { role: 'assistant', content: 'Some preferences' }, { role: 'user', content: 'Explain JavaScript null' }];
    record('profile follow-up isolation', 'Anything else after topic change', false,
        !!resolveProfileRecall('Anything else', profileHistory));
    for (const input of ['Can you explain how to delete a note', 'I was wondering how to delete a note',
        'Can you walk me through how deleting a note works? Just explain it.',
        'Please do not delete the note called scratchpad', 'I was wondering how to rename the note called old plan to new plan',
        'Before doing anything explain how to delete the note called scratchpad',
        'Do not calculate two plus two', 'I am curious how to calculate two plus two']) {
        state.pendingAction = null;
        state.pendingPlan = null;
        state.lastFileAction = null;
        const before = toolCalls.length;
        const result = await route(resolve(input), input, [], 'offline-audit', 'offline-audit');
        const noAction = toolCalls.length === before && !state.pendingAction && !state.pendingPlan;
        record('explanation/negation through actual planner', input, true, noAction);
        results[results.length - 1].route = result.toolName || 'conversation';
        results[results.length - 1].simulatedCalls = toolCalls.slice(before);
    }
    for (const [input, tool, argument] of [
        ['Read the code for contextManager.js', 'readCode', 'contextManager.js'],
        ['Search code for resolveProfileRecall', 'searchCode', 'resolveProfileRecall']
    ]) {
        state.pendingAction = null;
        state.pendingPlan = null;
        const before = toolCalls.length;
        await route(resolve(input), input, [], 'offline-code-audit', 'offline-code-audit');
        const calls = toolCalls.slice(before);
        record('code inspection routes', input, true, calls.length === 1 && calls[0].tool === tool
            && calls[0].args[0] === argument);
        results.at(-1).simulatedCalls = calls;
    }
    const output = path.resolve(__dirname, '../.local/reliability-audits', `${Date.now()}-boundaries.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const report = { generatedAt: new Date().toISOString(),
        scope: 'Guard coverage plus real planner with tool execution mocked; no live model, search, or database. A missed guard alone is not proof of a hallucinated response.',
        total: results.length, passed: results.filter(result => result.passed).length, results };
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ total: report.total, passed: report.passed,
        failures: results.filter(result => !result.passed), report: output }, null, 2));
    if (report.passed !== report.total) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
