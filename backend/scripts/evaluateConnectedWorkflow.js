// Isolated lifecycle rehearsal. Application lifecycle events are simulated;
// --live uses the real localhost model transport for background and foreground.
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const { EvidencePilot } = require('../src/reasoning/evidencePilot/runner');
const Events = require('../src/events/eventTypes');
const { generationProfile } = require('../src/reasoning/evidencePilot/generation');

async function waitForActive(pilot, signal) {
    const deadline = Date.now() + 5000;
    while (!pilot.active) {
        if (signal?.aborted) throw new Error('Workflow cancelled.');
        if (Date.now() > deadline) throw new Error('Background scheduler did not start.');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return pilot.active;
}

async function runWorkflow({ root, target, request, signal, collect, onProgress = () => {} }) {
    const events = new EventEmitter();
    const profile = generationProfile('outline');
    const checks = [];
    let calls = 0, interrupted = false, abortAt, settledAt, interruptTimer;
    const pilot = new EvidencePilot({ root, events, collect, idleMs: 30, pollMs: 60000,
        summaryKey: profile.summaryKey, summaryContract: require('../src/reasoning/evidencePilot/outline'),
        summarize: async (messages, { signal: modelSignal }) => {
            calls++;
            if (!interrupted) {
                interrupted = true;
                interruptTimer = setTimeout(() => {
                    abortAt = Date.now();
                    events.emit(Events.REQUEST_STARTED, { requestId: 'workflow-foreground' });
                }, 200);
                try {
                    await request(messages, modelSignal, 'background-interruption');
                    throw new Error('Background completed before interruption; interruption was not exercised.');
                } finally {
                    clearTimeout(interruptTimer);
                    settledAt = Date.now();
                }
            }
            return request(messages, modelSignal, 'background');
        } });
    const abort = () => { void pilot.stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    const checkSignal = () => { if (signal?.aborted) throw new Error('Workflow cancelled.'); };
    try {
        checkSignal();
        onProgress('Starting scheduled background analysis and foreground interruption.');
        pilot.start([target]);
        await assert.rejects(waitForActive(pilot, signal), /Analysis cancelled/);
        checkSignal();
        assert(abortAt && settledAt >= abortAt, 'Foreground interruption must reach an active model request.');
        assert.equal(await pilot.store.read(`${require('../src/reasoning/evidencePilot/collector').hash(target)}.json`), null,
            'Interrupted answer must not be published.');
        assert.equal((await pilot.runOnce()).status, 'deferred');
        checks.push({ check: 'foreground_interrupt', status: 'passed', clientSettlementMs: settledAt - abortAt });

        onProgress('Background client request settled; running the foreground model request.');
        const foreground = await request([{ role: 'user', content: 'Reply with the single word ready.' }], signal, 'foreground');
        const inspection = require('../src/reasoning/deepAnalysisResponse').inspectResponse(foreground);
        assert.equal(inspection.status, 'complete', `Foreground response incomplete: ${inspection.issues.join(', ')}`);
        checks.push({ check: 'foreground_response', status: 'passed', text: foreground.message.content });
        events.emit(Events.REQUEST_COMPLETED, { requestId: 'workflow-foreground' });

        onProgress('Checking idle resumption and unchanged-source cache reuse.');
        const resumed = await waitForActive(pilot, signal);
        assert.equal(resumed.status, 'complete');
        let review = await pilot.readCurrentRecords([target]);
        assert.equal(review.status, 'current');
        assert.equal(review.records[0].record.status, 'unverified_summary', review.records[0].record.audit?.error);
        const beforeVersion = review.snapshotVersion;
        const beforeCalls = calls;
        const cached = await pilot.runOnce([target]);
        assert.equal(cached.outcomes[0].status, 'cached');
        assert.equal(calls, beforeCalls);
        checks.push({ check: 'idle_resume_and_cache', status: 'passed', result: resumed });

        checkSignal();
        onProgress('Editing only the copied source, then checking rejection and scheduled refresh.');
        events.emit(Events.REQUEST_STARTED, { requestId: 'workflow-edit' });
        await fs.appendFile(path.join(root, target), '\n// Isolated lifecycle rehearsal: source freshness changed.\n');
        review = await pilot.readCurrentRecords([target]);
        assert.equal(review.status, 'stale');
        assert.equal(review.records.length, 0);
        events.emit(Events.REQUEST_COMPLETED, { requestId: 'workflow-edit' });
        const refreshed = await waitForActive(pilot, signal);
        review = await pilot.readCurrentRecords([target]);
        assert.equal(review.status, 'current');
        assert.notEqual(review.snapshotVersion, beforeVersion);
        assert.equal(review.records[0].record.status, 'unverified_summary', review.records[0].record.audit?.error);
        assert.equal(calls, beforeCalls + 1);
        checks.push({ check: 'stale_rejection_and_refresh', status: 'passed', result: refreshed });
        return { status: 'passed', checks, backgroundModelCalls: calls, store: pilot.store.directory,
            limitation: 'Simulated application events; client cancellation settlement does not prove server-side GPU cancellation. Model interpretations remain unverified. No production integration or knowledge promotion.' };
    } catch (error) {
        error.workflowChecks = checks;
        throw error;
    } finally {
        clearTimeout(interruptTimer);
        signal?.removeEventListener('abort', abort);
        await pilot.stop();
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1 || args[0] !== '--live') throw new Error('Usage: node backend/scripts/evaluateConnectedWorkflow.js --live (stop Alice first; requires local Ollama)');
    const sourceRoot = path.resolve(__dirname, '..');
    const parent = path.join(sourceRoot, '.local', 'connected-workflow-test');
    await fs.mkdir(parent, { recursive: true });
    const session = await fs.mkdtemp(path.join(parent, 'run-'));
    const root = path.join(session, 'backend');
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once('SIGINT', interrupt);
    const started = Date.now();
    let report;
    try {
        // Snapshot only allowlisted source/config/docs; never copy credentials,
        // node_modules, production memory, symlinks or executable hooks.
        const snapshot = require('../src/reasoning/evidencePilot/collector').snapshot(sourceRoot);
        for (const [name, file] of Object.entries(snapshot.files)) {
            const destination = path.resolve(root, name);
            assert(destination.startsWith(session + path.sep));
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, file.source);
        }
        report = await runWorkflow({ root, target: 'src/tasks/taskManager.js', signal: controller.signal,
            onProgress: text => console.error(text), request: async (messages, signal, phase) => {
                const generation = phase === 'foreground'
                    ? { model: 'qwen3.5:4b', think: false, stream: false, options: { temperature: 0, seed: 42, num_predict: 64 } }
                    : generationProfile('outline', JSON.parse(messages[1].content)).generation;
                return { ...await require('../src/models/providers/ollamaEnvelopeTransport').requestEnvelope(
                    { ...generation, messages }, { signal, timeoutMs: 600000 }), pilotGeneration: generation };
            } });
    } catch (error) {
        report = { status: 'failed', error: error.message, checks: error.workflowChecks || [], stack: error.stack };
        process.exitCode = 1;
    } finally { process.off('SIGINT', interrupt); }
    report = { ...report, mode: 'isolated_live_workflow', session, elapsedMs: Date.now() - started };
    await fs.writeFile(path.join(session, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runWorkflow };
