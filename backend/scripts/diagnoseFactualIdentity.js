// Local-model replay of recorded factual inputs. No database access or writes.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
async function main() {
    if (process.argv[2] !== '--live') { console.log('Use --live for isolated local-model comparison diagnostics.'); return; }
    if ((process.env.ATLAS_MODEL_PROVIDER || 'ollama') !== 'ollama') throw new Error('Local Ollama required.');
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (url, options) => {
        if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama requests are allowed.');
        return fetchOriginal(url, options);
    };
    const canonicalizer = require('../src/memory/memoryCanonicalizer');
    const { evaluateCases } = require('../src/memory/canonicalizationEvaluation');
    const incoming = { category: 'knowledge', knowledge_category: 'technology', subject: 'sqlite', key: 'database_library',
        value: "SQLite is a database library that runs within its host application's process.", topics: ['databases', 'database_library'] };
    const original = { id: 90, category: 'technology', subject: 'sqlite', key: 'database_type',
        value: 'SQLite is an in-process database library.', topics: ['databases', 'in_process'], verification_status: 'needs_source' };
    const noise = [
        { id: 88, category: 'technology', subject: 'sqlite', key: 'database_engine', value: 'The birch_demo_service uses SQLite as its database engine.', topics: ['database_engines', 'databases'], verification_status: 'needs_source' },
        { id: 89, category: 'technology', subject: 'postgresql', key: 'database_engine', value: 'The birch_demo_service now uses PostgreSQL as its database engine, replacing SQLite.', topics: ['database_engine', 'databases'], verification_status: 'needs_source' }
    ];
    const cases = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        for (const [name, rows] of [['clean', [original]], ['recorded_noise', [...noise, original]]]) {
            cases.push({ id: `${name}_${attempt}`, incoming, rows, expected: { relation: 'equivalent', matchedId: 90 } });
        }
    }
    try {
        const configuration = require('./helpers/memoryEvaluationMetadata').captureEvaluationMetadata(cases);
        const report = await evaluateCases(cases, { evaluate: (memory, rows, telemetry) => canonicalizer.evaluateWithModel(memory, rows, telemetry),
            onResult: result => console.log(`${result.id}: ${result.passed ? 'PASS' : 'FAIL'} ${result.reason}`) });
        report.model = configuration.model;
        report.configuration = configuration;
        const directory = path.resolve(__dirname, '../.local/canonicalization-evaluations');
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, `factual-diagnostic-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' });
        console.log(JSON.stringify({ ...report.summary, report: file }, null, 2));
        if (report.summary.passed !== report.summary.total) process.exitCode = 1;
    } finally { globalThis.fetch = fetchOriginal; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
