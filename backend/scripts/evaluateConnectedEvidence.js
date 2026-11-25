// Offline by default. --live is an explicit local-only model evaluation, never a production worker.
const path = require('node:path');
const { EvidencePilot } = require('../src/reasoning/evidencePilot/runner');
const targets = ['src/core/conversationEngine.js', 'src/tasks/taskManager.js', 'src/models/providers/ollamaEnvelopeTransport.js'];
const cases = { conversation: targets[0], 'task-manager': targets[1], 'task-cancellation': targets[1], transport: targets[2] };
async function main() {
    const args = process.argv.slice(2);
    const caseArg = args.find(arg => arg.startsWith('--case='));
    const profileArg = args.find(arg => arg.startsWith('--profile='));
    if (args.some(arg => arg !== '--live' && arg !== caseArg && arg !== profileArg) || (caseArg && !Object.hasOwn(cases, caseArg.slice(7)))) throw new Error('Usage: node backend/scripts/evaluateConnectedEvidence.js [--live] [--profile=reasoning|summary|outline] [--case=conversation|task-manager|task-cancellation|transport]');
    const profile = require('../src/reasoning/evidencePilot/generation').generationProfile(profileArg?.slice(10));
    const selectedTargets = caseArg ? [cases[caseArg.slice(7)]] : targets;
    const live = args.includes('--live');
    const delay = require('node:perf_hooks').monitorEventLoopDelay({ resolution: 20 });
    delay.enable();
    const pilot = new EvidencePilot({ root: path.resolve(__dirname, '..'), summaryKey: profile.summaryKey,
        ...(profile.name === 'outline' ? { summaryContract: require('../src/reasoning/evidencePilot/outline') } : {}),
        contextOptions: caseArg === '--case=task-cancellation' ? { targetSymbol: 'cancelTask', maxChars: 5000 } : { focus: ['cancel', 'abort', 'interrupt'],
        preferred: ['tests/conversationDeepAnalysis.test.js', 'tests/ollamaEnvelopeTransport.test.js', 'src/tasks/taskManager.js', 'src/reasoning/deepAnalysis.js', 'src/models/providers/ollama.js', 'src/core/conversationEngine.js'] }, summarize: live ? async (messages, { signal }) => {
        // Reuse the abortable localhost transport. Pin Alice’s existing model; no hosted-provider routing.
        const { requestEnvelope } = require('../src/models/providers/ollamaEnvelopeTransport');
        const generation = require('../src/reasoning/evidencePilot/generation').generationProfile(profile.name, JSON.parse(messages[1].content)).generation;
        return { ...await requestEnvelope({ ...generation, messages }, { signal, timeoutMs: 600000 }), pilotGeneration: generation };
    } : undefined });
    const interrupt = () => { void pilot.stop(); };
    process.once('SIGINT', interrupt);
    try {
        const result = await pilot.runOnce(selectedTargets);
        const current = await pilot.readCurrentRecords(selectedTargets);
        if (current.status !== 'current') throw new Error(`Review withheld: ${current.reason}`);
        const reviews = [];
        for (const { target, record } of current.records) {
            if (record) reviews.push({ target, snapshotVersion: record.snapshotVersion, status: record.status,
                operations: record.packet?.operations, interpretation: record.summary, failure: record.audit?.error || null });
        }
        await pilot.store.write('last-review.json', { freshness: { status: current.status, checkedAt: new Date().toISOString(), snapshotVersion: current.snapshotVersion,
            limitation: current.limitation }, policy: 'Syntax observations and unverified interpretations; withheld claims are audit data, not accepted knowledge.', reviews });
        const readableReview = path.join(pilot.store.directory, 'last-review.md');
        await require('node:fs/promises').writeFile(readableReview, require('../src/reasoning/evidencePilot/reviewReport').renderReview(reviews));
        const report = { mode: live ? 'live_local_unverified' : 'offline_evidence_only', profile: live ? profile.name : null, case: caseArg?.slice(7) || 'all', store: pilot.store.directory,
            reviewFile: path.join(pilot.store.directory, 'last-review.json'),
            readableReview,
            ...result, synthesisStatus: !live ? 'not_requested' : result.outcomes?.every(o => (o.recordStatus || o.status) === 'unverified_summary') ? 'completed_unverified' : 'incomplete_or_withheld',
            eventLoopDelayMaxMs: Math.round(delay.max / 1000000) };
        await pilot.store.write('last-run.json', report);
        console.log(JSON.stringify(report, null, 2));
    } finally { delay.disable(); process.off('SIGINT', interrupt); await pilot.stop(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
