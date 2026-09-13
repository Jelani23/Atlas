// Local Ollama proposals only. Never executes a proposed tool or contacts Supabase.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const dbPath = require.resolve('../src/database/supabaseClient');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: new Proxy({}, { get() { throw new Error('Database access forbidden in tool evaluation'); } }) };
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
    if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama is allowed');
    return originalFetch(url, options);
};
const executableTools = require('../src/tools');
for (const tool of Object.values(executableTools)) {
    if (tool && typeof tool.execute === 'function') {
        tool.execute = async () => { throw new Error('Tool execution forbidden in evaluation'); };
    }
}
const { getExecutableSchemas, validateSemanticPlan, compileToolPlan } = require('../src/planner/toolPlanning/toolPlanCompiler');
const { canonicalizeToolArguments } = require('../src/tools/toolArguments');
const { createSemanticToolPlanner } = require('../src/planner/toolPlanning/semanticToolPlanner');
const ollama = require('../src/models/providers/ollama');
const { getDefaultModel } = require('../src/models/modelRouter');
const cases = [
    { name: 'spoken arithmetic and word count',
        message: 'Calculate two plus two and then give me the word count of hello world',
        clauses: ['Calculate two plus two', 'give me the word count of hello world'],
        expected: [['calculate', ['2 + 2']], ['wordCount', ['hello world']]] },
    { name: 'spoken conversion and character count',
        message: 'Convert five kilometers to meters and then count the characters in Atlas',
        clauses: ['Convert five kilometers to meters', 'count the characters in Atlas'],
        expected: [['convertUnit', [5, 'kilometers', 'meters']], ['characterCount', ['Atlas']]] },
    { name: 'explicit independent tools', clauses: ['Calculate 2 + 2', 'Word count of hello world'],
        expected: [['calculate', ['2 + 2']], ['wordCount', ['hello world']]] },
    { name: 'paraphrased utility request', clauses: ['Could you total 2 + 2', 'Could you count the words in hello world'],
        expected: [['calculate', ['2 + 2']], ['wordCount', ['hello world']]] },
    { name: 'typed numeric arguments', clauses: ['Convert 5 kilometers to meters', 'Count the characters in Atlas'],
        expected: [['convertUnit', [5, 'kilometers', 'meters']], ['characterCount', ['Atlas']]] },
    { name: 'paraphrased read tools', clauses: ['Show every memo', 'Check online for Qwen releases'],
        expected: [['listNotes', []], ['webSearch', ['Qwen releases']]] },
    { name: 'search domains stay separate', clauses: ['Search the knowledge library for SQLite', 'Search the web for PostgreSQL architecture'],
        expected: [['searchKnowledge', ['SQLite']], ['webSearch', ['PostgreSQL architecture']]] },
    { name: 'missing target', clauses: ['Read a note', 'List my notes'], expected: null },
    { name: 'unsupported request', clauses: ['Teleport me to the Moon', 'List my notes'], expected: null },
    { name: 'dependent request', clauses: ['Find the file package.json', 'Read it'], expected: null },
    // These names are disposable prompt data; even a valid plan is never run.
    { name: 'explicit mutation target', clauses: ['Delete the note called scratchpad', 'List my notes'],
        expected: [['deleteNote', ['scratchpad']], ['listNotes', []]] },
    { name: 'multiword mutation targets', clauses: ['Rename note old plan to new plan', 'List my notes'],
        expected: [['renameNote', ['old_plan', 'new_plan']], ['listNotes', []]] },
    { name: 'conversation is not an action', clauses: ['We discussed searching notes', 'List my notes'], expected: null }
];

async function run() {
    const schemas = [...getExecutableSchemas().values()];
    const output = path.resolve(__dirname, '../.local/tool-plan-evaluations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const sources = Object.fromEntries([
        'src/planner/toolPlanning/toolPlanCompiler.js', 'src/planner/toolPlanning/semanticToolPlanner.js',
        'src/models/providers/ollama.js', 'src/intent/intentResolver.js', 'src/tools/toolArguments.js',
        'src/utils/arithmeticExpression.js'
    ].map(file => [file, fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')]));
    const report = { mode: 'local_model_proposals_no_execution', model: getDefaultModel().model,
        cases, schemas, sources, results: [] };
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    for (const fixture of cases) {
        const record = { name: fixture.name, passed: false };
        const started = Date.now();
        const propose = createSemanticToolPlanner({ adapter: {
            complete: async (messages, options) => {
                record.messages = messages;
                record.options = options;
                const response = await ollama.complete(messages, options);
                record.response = response;
                return response;
            }
        } });
        try {
            const message = fixture.message || fixture.clauses.join('; ');
            record.message = message;
            const proposal = await propose({ message, segments: fixture.clauses, schemas });
            record.proposal = proposal;
            const plan = validateSemanticPlan(proposal, fixture.clauses);
            record.actual = plan ? plan.steps.map(step => [step.toolName, step.args]) : null;
            // Also exercise segmentation and deterministic-first routing. Reuse
            // this proposal only if the compiler actually requests its fallback.
            record.compilation = await compileToolPlan(message, { semanticPlanner: async () => proposal });
            record.compiledActual = record.compilation.status === 'ready'
                ? record.compilation.plan.steps.map(step => [step.toolName, canonicalizeToolArguments(step.toolName, step.args)])
                : null;
            record.passed = isDeepStrictEqual(record.actual, fixture.expected) &&
                isDeepStrictEqual(record.compiledActual, fixture.expected);
        } catch (error) {
            record.error = error.message;
        }
        record.durationMs = Date.now() - started;
        report.results.push(record);
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(`${record.passed ? 'PASS' : 'FAIL'} ${fixture.name}: ${JSON.stringify(record.error || record.actual)}`);
    }
    report.summary = { passed: report.results.filter(row => row.passed).length, total: cases.length };
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report.summary, report: output }));
    if (report.summary.passed !== cases.length) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
