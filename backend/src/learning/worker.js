const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');
const { configuredSources, allowedUrl } = require('./sources');
const { collectSource } = require('./collector');
const { createRepository } = require('./repository');
const { SEARCH_STATUS } = require('../utils/searchEvidence');

function defaultRepository() {
    // Keep Supabase initialization lazy so offline tests and disabled installs
    // can load the worker without requiring production credentials.
    const client = require('../database/supabaseClient');
    return createRepository(client);
}

function toEvidence(source, collected) {
    return [
        SEARCH_STATUS.RESULTS_FOUND,
        `BACKGROUND_SOURCE: ${source.id}`,
        ...collected.documents.flatMap(document => [
            `Source URL: ${document.url}`,
            `Published: ${document.publishedAt || 'undated'}`,
            document.text
        ])
    ].join('\n');
}

class PassiveLearningWorker {
    constructor({
        repository,
        collect = collectSource,
        extractor,
        sources = configuredSources,
        events = eventBus,
        enabled = process.env.KNOWLEDGE_LEARNING_ENABLED === 'true'
    } = {}) {
        this.repository = repository || null;
        this.collect = collect;
        this.extractor = extractor || null;
        this.sources = sources;
        this.events = events;
        this.enabled = enabled;
        this.timer = null;
        this.activeRun = null;
        this.foregroundActive = false;
        this.initialized = false;
        this.sourceIndex = 0;
        this.idleDelayMs = Math.max(10_000, Number(process.env.KNOWLEDGE_LEARNING_IDLE_DELAY_MS) || 90_000);
        this.intervalSeconds = Math.min(604_800, Math.max(3_600,
            Number(process.env.KNOWLEDGE_LEARNING_INTERVAL_SECONDS) || 86_400));
        this._onRequestStarted = this._onRequestStarted.bind(this);
        this._onRequestFinished = this._onRequestFinished.bind(this);
    }

    initialize() {
        if (!this.enabled || this.initialized) return;
        if (!this.repository) this.repository = defaultRepository();
        if (!this.extractor) this.extractor = require('../memory/searchKnowledgeExtractor');
        this.initialized = true;
        this.events.on(EventTypes.REQUEST_STARTED, this._onRequestStarted);
        this.events.on(EventTypes.REQUEST_COMPLETED, this._onRequestFinished);
        this.events.on(EventTypes.REQUEST_FAILED, this._onRequestFinished);
        console.log(
            `[PassiveLearning] Worker enabled | sources=${this.sources().map(source => source.id).join(',')} ` +
            `| idleDelay=${this.idleDelayMs}ms | interval=${this.intervalSeconds}s`
        );
    }

    _onRequestStarted() {
        this.foregroundActive = true;
        this.cancelScheduledRun();
    }

    _onRequestFinished() {
        this.foregroundActive = false;
        this.schedule();
    }

    cancelScheduledRun() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    schedule(delayMs = this.idleDelayMs) {
        if (!this.enabled || !this.initialized || this.activeRun || this.foregroundActive || this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            console.log('[PassiveLearning] Starting scheduled source check.');
            this.processOne().catch(error => console.error('[PassiveLearning] Unexpected worker failure:', error.message));
        }, Math.max(0, delayMs));
        if (typeof this.timer.unref === 'function') this.timer.unref();
        console.log(`[PassiveLearning] Next source check scheduled in ${Math.max(0, delayMs)}ms.`);
    }

    async processOne() {
        if (!this.enabled || !this.initialized || this.activeRun || this.foregroundActive) {
            return { status: 'deferred' };
        }
        const run = this._runOne();
        this.activeRun = run;
        try {
            return await run;
        } finally {
            if (this.activeRun === run) this.activeRun = null;
            // Schedule only after activeRun is cleared; otherwise schedule()
            // correctly mistakes the completed promise for a live run.
            this.schedule();
        }
    }

    async _runOne() {
        let source;
        try {
            const list = this.sources();
            if (!list.length) return { status: 'no_sources' };
            source = list[this.sourceIndex % list.length];
            this.sourceIndex = (this.sourceIndex + 1) % list.length;
            const claimed = await this.repository.claim(source);
            if (!claimed) {
                console.log(`[PassiveLearning] ${source.id} is not due yet, or another learning run is active.`);
                return { status: 'idle', source: source.id };
            }
            this._claimForFailure = claimed;

            const collected = await this.collect(source);
            if (claimed.last_fingerprint && claimed.last_fingerprint === collected.fingerprint) {
                await this.repository.finish(claimed, 'complete', {
                    source: source.id, status: 'unchanged', documents: collected.documents.length
                }, collected.fingerprint, this.intervalSeconds);
                return { status: 'unchanged', source: source.id };
            }

            const evidence = toEvidence(source, collected);
            const extraction = await this.extractor.extractAndSaveFromSearch({
                query: `passive learning: ${source.id}`,
                summary: '',
                rawResults: evidence,
                allowedSubjects: source.subjects,
                sourceUrlPredicate: url => allowedUrl(source, url),
                maxTokens: 1_400,
                maxMemories: 4
            });
            if (extraction?.error || ['no_memories_returned', 'no_valid_memories'].includes(extraction?.reason)) {
                throw new Error(`Knowledge extraction did not produce a usable result (${extraction.error || extraction.reason}).`);
            }
            await this.repository.finish(claimed, 'complete', {
                source: source.id, status: 'updated', documents: collected.documents.length,
                extraction: { saved: extraction.saved || 0, duplicates: extraction.duplicates || 0 }
            }, collected.fingerprint, this.intervalSeconds);
            return { status: 'complete', source: source.id, extraction };
        } catch (error) {
            if (source && this._claimForFailure) {
                // A claim may have succeeded before a reader or extractor failed.
                // The database function makes this completion idempotent and
                // schedules a slower retry for failed runs.
                try {
                    const activeClaim = this._claimForFailure;
                    await this.repository.finish(activeClaim, 'failed', {
                        source: source.id, error: error.message
                    }, null, this.intervalSeconds);
                } catch (finishError) {
                    console.error('[PassiveLearning] Failed to record run failure:', finishError.message);
                }
            }
            console.error(`[PassiveLearning] ${source?.id || 'run'} failed:`, error.message);
            return { status: 'failed', source: source?.id || null, error: error.message };
        } finally {
            this._claimForFailure = null;
        }
    }

    async shutdown() {
        this.cancelScheduledRun();
        if (this.initialized) {
            this.events.off(EventTypes.REQUEST_STARTED, this._onRequestStarted);
            this.events.off(EventTypes.REQUEST_COMPLETED, this._onRequestFinished);
            this.events.off(EventTypes.REQUEST_FAILED, this._onRequestFinished);
        }
        this.initialized = false;
    }
}

const passiveLearningWorker = new PassiveLearningWorker();
module.exports = passiveLearningWorker;
module.exports.PassiveLearningWorker = PassiveLearningWorker;
module.exports.toEvidence = toEvidence;
