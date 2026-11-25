// Explicit application pilot only. Never feeds inferred claims into memory/chat.
function createApplicationPilot({ enabled = process.env.ATLAS_CONNECTED_EVIDENCE_PILOT === 'true',
    root = require('node:path').resolve(__dirname, '../../..'),
    Pilot, request, enqueue, log = value => console.log('[ConnectedEvidence]', JSON.stringify(value)) } = {}) {
    if (!enabled) return { start() {}, async stop() {}, foreground: fn => fn(), status: () => ({ enabled: false }),
        async reanalyze() { throw new Error('Connected evidence pilot is disabled.'); } };
    Pilot ||= require('./runner').EvidencePilot;
    request ||= require('../../models/providers/ollamaEnvelopeTransport').requestEnvelope;
    enqueue ||= require('../../memory/llmQueue').enqueue;
    const { generationProfile } = require('./generation');
    let state = { enabled: true, phase: 'idle', lastResult: null };
    let stopped = false;
    const publish = update => { state = { ...state, ...update }; log(state); };
    class ObservedPilot extends Pilot {
        async runOnce(...args) {
            if (this.active || this.foreground.size) return { status: 'deferred' };
            publish({ phase: 'collecting' });
            try {
                const result = await super.runOnce(...args);
                publish({ phase: 'idle', lastResult: result });
                return result;
            } catch (error) {
                publish({ phase: stopped ? 'stopped' : this.foreground.size ? 'yielded' : 'failed', error: error.message });
                throw error;
            }
        }
    }
    const pilot = new ObservedPilot({ root, idleMs: 10000, pollMs: 30000,
        summaryKey: generationProfile('outline').summaryKey, summaryContract: require('./outline'),
        summarize: (messages, { signal }) => new Promise((resolve, reject) => {
            let running = false;
            // Cancel waiting queue entries promptly. Their eventual callback is
            // inert; an already-running transport must settle before foreground.
            const cancelled = () => { if (!running) reject(new Error('Analysis cancelled.')); };
            signal.addEventListener('abort', cancelled, { once: true });
            if (signal.aborted) { cancelled(); signal.removeEventListener('abort', cancelled); return; }
            enqueue(async () => {
                if (signal.aborted) throw new Error('Analysis cancelled.');
                running = true;
                publish({ phase: 'summarizing', error: null });
                const generation = generationProfile('outline', JSON.parse(messages[1].content)).generation;
                return { ...await request({ ...generation, messages }, { signal, timeoutMs: 600000 }), pilotGeneration: generation };
            }).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
        }) });
    const service = {
        start() { if (!stopped) { pilot.start(['src/tasks/taskManager.js']); publish({ phase: 'scheduled' }); } },
        status: () => ({ ...state, foregroundCount: pilot.foreground.size, store: pilot.store.directory }),
        async reanalyze(focus = 'execution') {
            const scopes = { execution: '_executeTask', cancellation: 'cancelTask', creation: 'createTask', overview: null };
            if (!Object.hasOwn(scopes, focus)) throw new Error('Unknown analysis focus. Use execution, cancellation, creation or overview.');
            if (pilot.active || pilot.foreground.size) throw new Error('Pilot is busy; retry after the current work finishes.');
            return service.foreground(async () => {
                const target = 'src/tasks/taskManager.js';
                const previous = await pilot.store.read(`${require('./collector').hash(target)}.json`);
                const runId = require('node:crypto').randomUUID();
                // Preserve the prior answer and its exact packet before a deliberate retry.
                if (previous) await pilot.store.write(`review-before-rerun-${runId}.json`, previous);
                pilot.summaryKey = `${generationProfile('outline').summaryKey}/manual-${runId}`;
                pilot.contextOptions = scopes[focus] ? { targetSymbol: scopes[focus], includeCallers: true, maxChars: 12000 } : {};
                publish({ phase: 'scheduled', focus, runId, error: null });
                return { status: 'scheduled', focus, runId, idleMs: pilot.idleMs };
            });
        },
        async foreground(fn) {
            if (stopped) throw new Error('Analysis pilot is shutting down.');
            const token = { requestId: require('node:crypto').randomUUID() };
            pilot.started(token);
            try {
                const active = pilot.active;
                if (active) {
                    publish({ phase: 'yielding' });
                    await active.catch(() => {});
                }
                if (stopped) throw new Error('Analysis pilot is shutting down.');
                return await fn();
            } finally {
                pilot.finished(token);
            }
        },
        async stop() { stopped = true; await pilot.stop(); publish({ phase: 'stopped' }); }
    };
    return service;
}
module.exports = { createApplicationPilot };
