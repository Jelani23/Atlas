require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (['--suite', '--model'].includes(flag)) {
            if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Supply a value after ${flag}.`);
            index++;
        } else if (!['--live', '--experimental-assertion-check'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    }
    const experimentalAssertionCheck = args.includes('--experimental-assertion-check');
    const modelIndex = args.indexOf('--model');
    if (modelIndex >= 0) {
        const model = args[modelIndex + 1];
        if (!model || model.startsWith('--')) throw new Error('Supply an installed local model name after --model.');
        process.env.OLLAMA_MODEL = model;
        process.env.OLLAMA_MODEL_MEMORY = model;
    }
    const suiteIndex = args.indexOf('--suite');
    const suite = suiteIndex < 0 ? 'baseline' : args[suiteIndex + 1];
    if (!['baseline', 'heldout', 'challenge', 'assertion', 'ownership', 'all'].includes(suite)) throw new Error('Use --suite baseline, heldout, challenge, assertion, ownership, or all.');
    const cases = [
        ...(['baseline', 'all'].includes(suite) ? require('../tests/fixtures/canonicalizationCases') : []),
        ...(['heldout', 'all'].includes(suite) ? require('../tests/fixtures/canonicalizationHeldOutCases') : []),
        ...(['challenge', 'all'].includes(suite) ? require('../tests/fixtures/canonicalizationChallengeCases') : []),
        ...(['assertion', 'all'].includes(suite) ? require('../tests/fixtures/canonicalizationAssertionCases') : []),
        ...(['ownership', 'all'].includes(suite) ? require('../tests/fixtures/canonicalizationOwnershipCases') : [])
    ];
    if (!args.includes('--live')) {
        console.log(JSON.stringify({ mode: 'preview', model: process.env.OLLAMA_MODEL_MEMORY?.trim() || process.env.OLLAMA_MODEL || 'qwen3.5:4b', experimentalAssertionCheck, note: 'Use --live for local model calls. No production memories are read or written.', cases: cases.map(test => ({ id: test.id, expected: test.expected })) }, null, 2));
        return;
    }
    const provider = process.env.ATLAS_MODEL_PROVIDER || 'ollama';
    if (provider !== 'ollama') throw new Error('This live evaluation supports local Ollama only; no external provider calls were made.');
    if (['false', 'disabled', 'off', '0'].includes(String(process.env.SEMANTIC_MEMORY_CANONICALIZATION).toLowerCase())) {
        throw new Error('Canonicalization is disabled; enable it before evaluating its live behavior.');
    }
    const { evaluateCases } = require('../src/memory/canonicalizationEvaluation');
    const { evaluateWithModel } = require('../src/memory/memoryCanonicalizer');
    const configuration = require('./helpers/memoryEvaluationMetadata').captureEvaluationMetadata(cases);
    const output = path.resolve(__dirname, '../.local/canonicalization-evaluations', `${Date.now()}.json`);
    const progress = output.replace(/\.json$/, '.progress.jsonl');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(progress, JSON.stringify({ status: 'running', provider, suite, experimentalAssertionCheck, configuration }) + '\n', { flag: 'wx' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => {
        if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama requests are allowed in this evaluation.');
        return originalFetch(url, options);
    };
    const report = await evaluateCases(cases, {
        evaluate: (memory, candidates, telemetry) => evaluateWithModel(memory, candidates, { ...telemetry, experimentalAssertionCheck, signal: AbortSignal.timeout(30000) }),
        onResult: result => {
            fs.appendFileSync(progress, JSON.stringify({ result }) + '\n');
            console.error(`${result.passed ? 'PASS' : 'FAIL'} ${result.id}: ${result.actual.relation} (${result.durationMs}ms)`);
        }
    });
    report.provider = provider;
    report.configuration = configuration;
    report.experimentalAssertionCheck = experimentalAssertionCheck;
    report.suite = suite;
    report.model = configuration.model;
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
    fs.appendFileSync(progress, JSON.stringify({ status: 'complete', summary: report.summary, report: output }) + '\n');
    globalThis.fetch = originalFetch;
    console.log(JSON.stringify({ ...report.summary, model: report.model, report: output }, null, 2));
    if (report.summary.passed !== report.summary.total) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
