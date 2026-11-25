const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { createStore } = require('./store');
const { buildContext, messages, validate } = require('./context');
const Events = require('../../events/eventTypes');

async function scan(root, previousVersion, signal, { timeoutMs = 60000, targets = [], contextOptions = {}, contextKey, checkOnly = false } = {}) {
    const fs = require('node:fs/promises');
    if (signal?.aborted) throw new Error('Analysis cancelled.');
    const scratch = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'atlas-cruise-'));
    try {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('Analysis cancelled.'));
        const worker = new Worker(path.join(__dirname, 'collectorThread.js'), { workerData: { root, previousVersion, scratch, targets, contextOptions, contextKey, checkOnly }, resourceLimits: { maxOldGenerationSizeMb: 384 } });
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            worker.terminate().then(async () => {
                if (error) throw error;
                if (signal?.aborted) throw new Error('Analysis cancelled.');
                if (result.graph) {
                    const store = createStore(root);
                    result.graph.evidenceFile = await store.importEvidence(path.join(scratch, 'evidence-snapshot.json'), result.graph.snapshot.version);
                }
                resolve(result);
            }).catch(reject);
        };
        const abort = () => finish(new Error('Analysis cancelled.'));
        const timer = setTimeout(() => finish(new Error('Collector timed out.')), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        worker.once('message', value => finish(value.error ? new Error(value.error) : null, value));
        worker.once('error', finish);
        worker.once('exit', code => { if (!settled) finish(new Error(`Collector exited without result (${code}).`)); });
    }).finally(() => fs.rm(scratch, { recursive: true, force: true }));
    } catch (error) { await fs.rm(scratch, { recursive: true, force: true }); throw error; }
}

class EvidencePilot {
    constructor({ root, events, summarize, summaryKey = 'unspecified-profile-v1', summaryContract = { messages, validate }, collect = scan, idleMs = 2000, pollMs = 30000, modelTimeoutMs = 600000, contextOptions = {} }) {
        this.root = path.resolve(root); this.store = createStore(this.root); this.events = events;
        this.summarize = summarize; this.collect = collect; this.idleMs = idleMs; this.pollMs = pollMs; this.modelTimeoutMs = modelTimeoutMs;
        this.targets = new Set(); this.foreground = new Set(); this.active = null; this.timer = null; this.enabled = false;
        this.generation = 0;
        this.contextOptions = contextOptions;
        this.summaryKey = summaryKey;
        this.summaryContract = summaryContract;
        this.started = event => {
            this.foreground.add(event.requestId || event.taskId || 'unknown'); this.generation++;
            clearTimeout(this.timer); this.timer = null; this.controller?.abort();
        };
        this.finished = event => { this.foreground.delete(event.requestId || event.taskId || 'unknown'); this.schedule(this.idleMs); };
    }
    start(targets) {
        for (const target of targets) this.targets.add(target);
        if (this.enabled) return;
        this.enabled = true;
        this.events?.on(Events.REQUEST_STARTED, this.started);
        for (const type of [Events.REQUEST_COMPLETED, Events.REQUEST_FAILED, Events.REQUEST_CANCELLED]) this.events?.on(type, this.finished);
        this.schedule(this.idleMs);
    }
    schedule(delay) {
        if (!this.enabled || this.timer || this.active || this.foreground.size) return;
        this.timer = setTimeout(() => { this.timer = null; this.runOnce().catch(error => { this.lastError = error.message; }); }, delay);
        this.timer.unref?.();
    }
    runOnce(targets = [...this.targets]) {
        if (this.active || this.foreground.size) return Promise.resolve({ status: 'deferred' });
        const generation = this.generation;
        this.controller = new AbortController();
        const check = () => { if (this.controller.signal.aborted || generation !== this.generation || this.foreground.size) throw new Error('Analysis cancelled.'); };
        this.active = this.run(targets, check, this.controller.signal).finally(() => {
            this.active = null; this.controller = null; this.schedule(this.pollMs);
        });
        return this.active;
    }
    async run(targets, check, signal) {
        const started = Date.now();
        let graph = await this.store.read('graph.json');
        check();
        const contextKey = require('./collector').hash(JSON.stringify({ targets: [...new Set(targets)].sort(), options: this.contextOptions }));
        const result = await this.collect(this.root, graph?.contextKey === contextKey ? graph.snapshot.version : undefined, signal,
            { targets, contextOptions: this.contextOptions, contextKey });
        check();
        if (result.graph) {
            const manifest = result.graph.snapshot.manifest;
            const changed = [...new Set([...Object.keys(graph?.snapshot.manifest || {}), ...Object.keys(manifest)])]
                .filter(name => graph?.snapshot.manifest[name] !== manifest[name]);
            const affected = require('./dependencies').affectedTargets(graph, result.graph, changed);
            await this.store.write('invalidation.json', { changed, affected, policy: 'All summaries invalidated on any snapshot change; graph impact is advisory because dynamic links may be missing.' });
            graph = result.graph;
            // Publish new generation first. Old records can never be returned as current afterward.
            await this.store.write('current.json', { version: graph.snapshot.version, state: 'refreshing' });
            await this.store.write('graph.json', graph);
        }
        if (!graph) throw new Error('No evidence snapshot.');
        const outcomes = [];
        for (const target of [...new Set(targets)]) {
            check();
            if (!(graph.packets ? graph.packets[target] : graph.records[target])) {
                await this.store.saveRecord(target, { snapshotVersion: graph.snapshot.version, status: 'deleted_or_outside_scope', summary: null });
                outcomes.push({ target, status: 'deleted_or_outside_scope' }); continue;
            }
            const cached = await this.store.readRecord(target, graph.snapshot.version);
            const packet = graph.packets ? graph.packets[target] : buildContext(graph, target, this.contextOptions);
            if (cached && cached.packet?.fingerprint === packet.fingerprint && (!this.summarize ||
                (cached.summaryKey === this.summaryKey && (cached.summary || cached.audit)))) {
                outcomes.push({ target, status: 'cached', recordStatus: cached.status,
                    withheldClaimCount: cached.summary?.withheldClaims?.length || 0,
                    ...(cached.audit?.error ? { modelFailure: cached.audit.error, doneReason: cached.audit.doneReason || null } : {}) });
                continue;
            }
            let summary = null, audit = null;
            if (this.summarize) {
                audit = { request: this.summaryContract.messages(packet) };
                const modelController = new AbortController();
                const abortModel = () => modelController.abort();
                signal.addEventListener('abort', abortModel, { once: true });
                if (signal.aborted) abortModel();
                let timedOut = false;
                const timer = setTimeout(() => { timedOut = true; modelController.abort(); }, this.modelTimeoutMs);
                try {
                    // Await provider settlement even after cancellation: never launch a second background model call while one is pending.
                    const request = audit.request;
                    check();
                    const response = await this.summarize(request, { signal: modelController.signal });
                    check();
                    audit = { model: response.model, doneReason: response.done_reason, durationNs: response.total_duration,
                        promptTokens: response.prompt_eval_count ?? null, generatedTokens: response.eval_count ?? null,
                        generation: response.pilotGeneration || null,
                        text: response.message?.content || '', request };
                    const inspection = require('../deepAnalysisResponse').inspectResponse(response);
                    audit.completion = { status: inspection.status, issues: inspection.issues, warnings: inspection.warnings };
                    if (timedOut) throw new Error('Local model deadline exceeded; unchanged failure cached.');
                    if (inspection.status !== 'complete') throw new Error(`Incomplete local model response: ${inspection.issues.join(', ')}.`);
                    summary = this.summaryContract.validate(audit.text, packet);
                } catch (error) {
                    check();
                    audit = { ...audit, error: timedOut ? 'Local model deadline exceeded; unchanged failure cached.' : error.message };
                } finally { clearTimeout(timer); signal.removeEventListener('abort', abortModel); }
            }
            // Recheck the entire manifest, including previously missing dependency candidates and documents.
            const fresh = await this.collect(this.root, graph.snapshot.version, signal, { checkOnly: true });
            check();
            if (!fresh.unchanged) {
                await this.store.write('current.json', { version: null, state: 'stale_during_run' });
                throw new Error('Source changed during analysis; result discarded.');
            }
            await this.store.saveRecord(target, { snapshotVersion: graph.snapshot.version, packet,
                evidenceFile: graph.evidenceFile, summaryKey: this.summarize ? this.summaryKey : null,
                status: summary ? 'unverified_summary' : 'evidence_only', summary, audit });
            outcomes.push({ target, status: summary ? 'unverified_summary' : 'evidence_only',
                withheldClaimCount: summary?.withheldClaims?.length || 0,
                ...(audit?.error ? { modelFailure: audit.error, doneReason: audit.doneReason || null } : {}) });
        }
        const finalCheck = await this.collect(this.root, graph.snapshot.version, signal, { checkOnly: true });
        check();
        if (!finalCheck.unchanged) {
            await this.store.write('current.json', { version: null, state: 'stale_during_run' });
            throw new Error('Source changed during analysis; result discarded.');
        }
        await this.store.write('current.json', { version: graph.snapshot.version, state: 'complete' });
        return { status: 'complete', outcomes, elapsedMs: Date.now() - started, collector: { ...graph.metrics, reused: !result.graph },
            dependencies: graph.dependencyCruiser && { status: graph.dependencyCruiser.status, agreed: graph.dependencyCruiser.agreed,
                compilerOnly: graph.dependencyCruiser.compilerOnly?.length, cruiserOnly: graph.dependencyCruiser.cruiserOnly?.length,
                elapsedMs: graph.dependencyCruiser.elapsedMs, error: graph.dependencyCruiser.error } };
    }
    async recall(target) {
        const review = await this.readCurrentRecords([target]);
        return review.status === 'current' ? review.records[0]?.record || null : null;
    }
    async readCurrentRecords(targets) {
        // Never expose incomplete or stale generations as current knowledge. These
        // probes hash source only: no compiler, graph rebuild, inference or writes.
        const current = await this.store.read('current.json');
        const unavailable = (status, reason) => ({ status, reason, records: [], snapshotVersion: current?.version || null });
        if (!current?.version) return unavailable('unavailable', 'No completed source generation is available.');
        if (current.state !== 'complete') return unavailable('incomplete', 'The evidence generation is still refreshing or did not complete.');
        const probe = () => this.collect(this.root, current.version, undefined, { checkOnly: true });
        if (!(await probe()).unchanged) return unavailable('stale', 'Source or analysis implementation changed; refresh the isolated pilot.');
        const records = [];
        for (const target of [...new Set(targets)]) {
            const record = await this.store.readRecord(target, current.version);
            if (!record) return unavailable('incomplete', `No matching record for ${target}.`);
            records.push({ target, record });
        }
        const after = await this.store.read('current.json');
        if (after?.version !== current.version || after?.state !== 'complete' || !(await probe()).unchanged)
            return unavailable('stale', 'Evidence or source changed while reading the review.');
        const confirmed = await this.store.read('current.json');
        if (confirmed?.version !== current.version || confirmed?.state !== 'complete')
            return unavailable('stale', 'Evidence publication changed during the final freshness check.');
        return { status: 'current', snapshotVersion: current.version, records,
            limitation: 'Current at the time of these checks; subsequent edits invalidate this result. Model interpretations remain unverified.' };
    }
    async stop() {
        this.enabled = false; this.generation++; clearTimeout(this.timer); this.timer = null; this.controller?.abort();
        this.events?.off(Events.REQUEST_STARTED, this.started);
        for (const type of [Events.REQUEST_COMPLETED, Events.REQUEST_FAILED, Events.REQUEST_CANCELLED]) this.events?.off(type, this.finished);
        try { await this.active; } catch { /* Cancelled work is never published. */ }
    }
}
module.exports = { scan, EvidencePilot };
