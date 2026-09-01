const sessionManager = require('./sessionManager');
const reflectionEngine = require('./reflectionEngine');
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

class ReflectionWorker {
    constructor({ sessions = sessionManager, engine = reflectionEngine } = {}) {
        this.sessions = sessions;
        this.engine = engine;
        this.timer = null;
        this.running = false;
        this.activeRun = null;
        this.foregroundActive = false;
        this.initialized = false;
        this.enabled = process.env.REFLECTION_WORKER_ENABLED !== 'false';
        this.idleDelayMs = Math.max(
            1_000,
            Number(process.env.REFLECTION_IDLE_DELAY_MS) || 60_000
        );

        this._onRequestStarted = this._onRequestStarted.bind(this);
        this._onRequestFinished = this._onRequestFinished.bind(this);
    }

    initialize() {
        if (this.initialized) return;
        this.initialized = true;
        eventBus.on(EventTypes.REQUEST_STARTED, this._onRequestStarted);
        eventBus.on(EventTypes.REQUEST_COMPLETED, this._onRequestFinished);
        eventBus.on(EventTypes.REQUEST_FAILED, this._onRequestFinished);
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
        if (!this.enabled || this.running || this.foregroundActive || this.timer) {
            return;
        }

        this.timer = setTimeout(() => {
            this.timer = null;
            this.processOne().catch(error => {
                console.error('[ReflectionWorker] Unexpected worker failure:', error.message);
            });
        }, Math.max(0, delayMs));

        // A pending reflection timer must never keep the backend alive during
        // shutdown. Its durable session status is the source of truth.
        if (typeof this.timer.unref === 'function') this.timer.unref();
    }

    notifyPendingSession() {
        this.cancelScheduledRun();
        console.log(
            `[ReflectionWorker] Pending session registered; worker check scheduled in ${this.idleDelayMs}ms.`
        );
        this.schedule(this.idleDelayMs);
    }

    async processOne() {
        if (!this.enabled || this.activeRun || this.foregroundActive) {
            return { status: 'deferred' };
        }

        return this._startRun(() => this.sessions.claimNextReflectionSession());
    }

    async processSession(sessionId) {
        if (!this.enabled || !sessionId) {
            return { status: 'deferred', sessionId: sessionId || null };
        }

        this.cancelScheduledRun();
        if (this.activeRun) await this.activeRun;
        return this._startRun(() => this.sessions.claimReflectionSession(sessionId), sessionId);
    }

    async _startRun(claim, requestedSessionId = null) {
        const run = this._run(claim, requestedSessionId);
        this.activeRun = run;
        try {
            return await run;
        } finally {
            if (this.activeRun === run) this.activeRun = null;
        }
    }

    async _run(claim, requestedSessionId) {

        this.running = true;
        let claimed = null;

        try {
            claimed = await claim();
            if (!claimed) {
                if (requestedSessionId) {
                    console.log(`[ReflectionWorker] Session ${requestedSessionId} is no longer pending.`);
                    return { status: 'not_pending', sessionId: requestedSessionId };
                }
                console.log('[ReflectionWorker] No pending reflection sessions found.');
                return { status: 'idle' };
            }

            console.log(
                `[ReflectionWorker] Claimed session ${claimed.id} ` +
                `(attempt ${claimed.reflection_attempts}).`
            );

            const history = await this.sessions.getSessionMessages(claimed.id);
            const result = await this.engine.generateReflection(claimed.id, history);

            if (['saved', 'updated', 'exists'].includes(result?.status)) {
                await this.sessions.markReflectionComplete(claimed.id);
                console.log(`[ReflectionWorker] Session ${claimed.id} reflection complete.`);
                return { status: 'complete', sessionId: claimed.id };
            }

            throw new Error(`Reflection was not saved (${result?.reason || result?.status || 'unknown'}).`);
        } catch (error) {
            if (claimed?.id) {
                try {
                    await this.sessions.markReflectionFailed(
                        claimed.id,
                        error.message,
                        claimed.reflection_attempts
                    );
                } catch (statusError) {
                    console.error('[ReflectionWorker] Failed to persist job failure:', statusError.message);
                }
            }
            console.error('[ReflectionWorker] Reflection failed:', error.message);
            return { status: 'failed', sessionId: claimed?.id || null, error: error.message };
        } finally {
            this.running = false;
            // Leave backlog work for the next idle window.
            this.schedule();
        }
    }

    shutdown() {
        this.cancelScheduledRun();
        if (this.initialized) {
            eventBus.off(EventTypes.REQUEST_STARTED, this._onRequestStarted);
            eventBus.off(EventTypes.REQUEST_COMPLETED, this._onRequestFinished);
            eventBus.off(EventTypes.REQUEST_FAILED, this._onRequestFinished);
        }
        this.initialized = false;
    }
}

const reflectionWorker = new ReflectionWorker();

module.exports = reflectionWorker;
module.exports.ReflectionWorker = ReflectionWorker;
