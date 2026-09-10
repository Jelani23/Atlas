require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const args = process.argv.slice(2);
    const suiteIndex = args.indexOf('--suite');
    const suite = suiteIndex < 0 ? 'baseline' : args[suiteIndex + 1];
    if (!['baseline', 'heldout', 'all'].includes(suite)) throw new Error('Use --suite baseline, heldout, or all.');
    const cases = [
        ...(suite !== 'heldout' ? require('../tests/fixtures/canonicalizationCases') : []),
        ...(suite !== 'baseline' ? require('../tests/fixtures/canonicalizationHeldOutCases') : [])
    ];
    if (!args.includes('--live')) {
        console.log(JSON.stringify({ mode: 'preview', note: 'Use --live for local model calls. No production memories are read or written.', cases: cases.map(test => ({ id: test.id, expected: test.expected })) }, null, 2));
        return;
    }
    const provider = process.env.ATLAS_MODEL_PROVIDER || 'ollama';
    if (provider !== 'ollama') throw new Error('This live evaluation supports local Ollama only; no external provider calls were made.');
    if (['false', 'disabled', 'off', '0'].includes(String(process.env.SEMANTIC_MEMORY_CANONICALIZATION).toLowerCase())) {
        throw new Error('Canonicalization is disabled; enable it before evaluating its live behavior.');
    }
    const { evaluateCases } = require('../src/memory/canonicalizationEvaluation');
    const { evaluateWithModel } = require('../src/memory/memoryCanonicalizer');
    const report = await evaluateCases(cases, {
        evaluate: (memory, candidates) => evaluateWithModel(memory, candidates, { signal: AbortSignal.timeout(30000) }),
        onResult: result => console.error(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.actual.relation} (${result.durationMs}ms)`)
    });
    report.provider = provider;
    report.suite = suite;
    report.model = process.env.OLLAMA_MODEL || 'qwen3:4b';
    const output = path.resolve(__dirname, '../.local/canonicalization-evaluations', `${Date.now()}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ...report.summary, model: report.model, report: output }, null, 2));
    if (report.summary.passed !== report.summary.total) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
