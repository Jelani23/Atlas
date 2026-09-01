// backend/src/interface/atlasInterface.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = require('ws');
}

const EventEmitter = require('events');
const conversationEngine = require('../core/conversationEngine');
const personalityEngine = require('../core/personalityEngine');
const projectCache = require('../core/projectCache');
const memory = require('../memory');
const sessionManager = require('../memory/sessionManager');
const permissionManager = require('../permissions/permissionManager');
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');
const eventLogger = require('../events/eventLogger');
const ollamaProvider = require('../models/providers/ollama');
const modelRouter = require('../models/modelRouter');
const reflectionWorker = require('../memory/reflectionWorker');
const contextManager = require('../core/contextManager');

class AtlasInterface extends EventEmitter {
    constructor() {
        super();
        this.mode = personalityEngine.DEFAULT_MODE;
        this.sessionId = null;
        this.ready = false;
        this._initPromise = null;
        
        this.taskCounter = 1; 
        this.activeRequestId = null;

        eventLogger.initialize();

        permissionManager.on('permission.requested', (payload) => {
            this.emit('permission.requested', payload);
        });

        this._wireEventBusToUI();
    }

    _wireEventBusToUI() {
        eventBus.on(EventTypes.REQUEST_STARTED, ({ requestId, text }) => {
            this.activeRequestId = requestId;
            this.emit('user.message', { text });
            this.emit('atlas.request_started', { requestId });
        });
        
        eventBus.on(EventTypes.TASK_PROGRESS, ({ stage }) => {
            if (stage === 'thinking') {
                this.emit('atlas.thinking', { phase: 'thinking' });
            } else if (stage === 'generating') {
                this.emit('atlas.thinking', { phase: 'generating' });
            } else if (stage === 'intent') {
                this.emit('atlas.thinking', { phase: 'intent' });
            } else if (stage === 'memory' || stage === 'context') {
                this.emit('atlas.status', { phase: stage });
            }
        });

        eventBus.on(EventTypes.TOOL_STARTED, (payload) => {
            this.emit('atlas.tool_started', payload);
        });

        eventBus.on(EventTypes.TOOL_COMPLETED, (payload) => {
            this.emit('atlas.tool_completed', payload);
        });

        eventBus.on(EventTypes.MODEL_SELECTED, (payload) => {
            this.emit('atlas.model_changed', payload);
        });

        eventBus.on(EventTypes.REQUEST_COMPLETED, ({ reply }) => {
            this.emit('atlas.status', { phase: 'reply_ready' });
        });

        eventBus.on(EventTypes.TASK_COMPLETED, ({ result }) => {
            if (typeof result === 'string' && result.length > 0) {
                this.emit('atlas.response', { text: result, isBackground: true });
            }
        });

        eventBus.on(EventTypes.TASK_FAILED, ({ taskId, error }) => {
            const friendlyError = `I ran into an issue with that background task (${taskId}): ${error}`;
            this.emit('atlas.response', { text: friendlyError, isBackground: true });
        });

        eventBus.on(EventTypes.REQUEST_FAILED, ({ error }) => {
            this.emit('atlas.error', { message: error });
        });
        
        // 8G.1: Only forward 'content' tokens to the UI as visible chat
        eventBus.on(EventTypes.LLM_TOKEN_STREAM, ({ token, tokenType, requestId }) => {
            if (tokenType === 'content') {
                this.emit('atlas.streaming', { token, requestId });
            }
        });
        
        // streaming TTS audio chunks to the UI
        eventBus.on(EventTypes.TTS_AUDIO_CHUNK, ({ audio, requestId, phonemes }) => {
            this.emit('atlas.audio_chunk', { audio, requestId, phonemes });
        });
    }


    async _reflectOnSession(sessionId) {
        if (!sessionId) return;

        // Reflections cover the entire ordered session. The normal conversation
        // path intentionally reads only a short recent window, but reusing that
        // limit here silently discarded the beginning of long sessions.
        const history = await sessionManager.getSessionMessages(sessionId);
        // Delegates to the shared reflectionEngine (see
        // memory/reflectionEngine.js) - this used to duplicate the
        // prompt/parser logic inline here and in the orphaned
        // index.js CLI entrypoint, and called the model directly instead
        // of through llmQueue. Both are fixed at the shared call site now.
        await memory.reflectionEngine.generateReflection(sessionId, history);
    }

    async initialize() {
        if (this.ready) return this.sessionId;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            await projectCache.initialize();

            // No live session exists yet, so any `open` row belongs to a prior
            // backend process. Close/requeue it before creating this process's
            // session, then let the idle worker handle the durable jobs.
            reflectionWorker.initialize();
            try {
                const recovery = await sessionManager.recoverReflectionLifecycle();
                if (recovery.supported && (recovery.recovered || recovery.abandoned)) {
                    console.log(
                        `[ReflectionWorker] Recovered ${recovery.recovered} interrupted job(s) ` +
                        `and ${recovery.abandoned} abandoned session(s).`
                    );
                }
            } catch (error) {
                // Reflection recovery must never stop Alice from starting. The
                // durable statuses remain available for the next retry.
                console.error('[ReflectionWorker] Startup recovery failed:', error.message);
            }

            this.sessionId = await sessionManager.startSession();
            contextManager.registerPreviousSession(this.sessionId);
            
            const defaultModel = modelRouter.getDefaultModel().model;
            ollamaProvider.warmup(defaultModel);

            this.ready = true;
            this.emit('atlas.status', { phase: 'ready', sessionId: this.sessionId });
            reflectionWorker.schedule();
            return this.sessionId;
        })();

        return this._initPromise;
    }

    getState() {
        return {
            mode: this.mode,
            sessionId: this.sessionId != null ? String(this.sessionId) : null,
            ready: this.ready
        };
    }

    async listConversations() {
        const sessions = await sessionManager.listSessions();
        return sessions.map((s) => ({
            id: String(s.id),
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            title: s.title,
            preview: s.preview,
            isCurrent: this.sessionId != null && String(s.id) === String(this.sessionId)
        }));
    }

    async getConversation(sessionId) {
        if (!sessionId) return [];
        return sessionManager.getSessionMessages(sessionId);
    }

    async newConversation() {
        const outgoingSessionId = this.sessionId;
        console.log(`[AtlasInterface] New conversation requested | outgoing=${outgoingSessionId || 'none'}`);
        let closeResult = null;
        if (outgoingSessionId) {
            closeResult = await sessionManager.endSession(outgoingSessionId);
        }

        this.sessionId = await sessionManager.startSession();
        const previousReflectionSessionId = ['pending', 'complete'].includes(closeResult?.reflectionStatus)
            ? outgoingSessionId
            : null;
        contextManager.registerPreviousSession(this.sessionId, previousReflectionSessionId);
        console.log(`[AtlasInterface] New conversation started | session=${this.sessionId}`);
        this.emit('atlas.status', { phase: 'new_conversation', sessionId: this.sessionId });

        if (outgoingSessionId) {
            if (closeResult?.lifecycleEnabled) {
                if (closeResult.reflectionStatus === 'pending') {
                    const result = await reflectionWorker.processSession(outgoingSessionId);
                    if (!['complete', 'not_pending'].includes(result.status)) {
                        console.warn(
                            `[ReflectionWorker] Session ${outgoingSessionId} was not ready at conversation close ` +
                            `(status=${result.status}).`
                        );
                    }
                } else {
                    console.log(
                        `[ReflectionWorker] Session ${outgoingSessionId} does not require a reflection ` +
                        `(status=${closeResult.reflectionStatus}).`
                    );
                }
            } else {
                // Backward-compatible path until migration 004 is applied.
                this._reflectOnSession(outgoingSessionId).catch(error => {
                    console.error('[ReflectionEngine] Legacy reflection failed:', error.message);
                });
            }
        }

        return String(this.sessionId);
    }

    async deleteConversation(sessionId) {
        if (!sessionId) return { ok: false };

        const wasCurrent = this.sessionId != null && String(this.sessionId) === String(sessionId);
        await sessionManager.deleteSession(sessionId);

        let newSessionId = null;
        if (wasCurrent) {
            this.sessionId = await sessionManager.startSession();
            contextManager.registerPreviousSession(this.sessionId);
            newSessionId = String(this.sessionId);
            this.emit('atlas.status', { phase: 'new_conversation', sessionId: this.sessionId });
        }

        return { ok: true, newSessionId };
    }

    async renameConversation(sessionId, title) {
        if (!sessionId) return { ok: false };
        const savedTitle = await sessionManager.renameSession(sessionId, title);
        return { ok: true, title: savedTitle };
    }

    listModes() {
        return personalityEngine.listModes();
    }

    setMode(mode) {
        if (!personalityEngine.listModes().includes(mode)) {
            throw new Error(`Unknown mode: ${mode}. Available: ${personalityEngine.listModes().join(', ')}`);
        }
        this.mode = mode;
        this.emit('atlas.status', { phase: 'mode_changed', mode });
        return this.mode;
    }

    async resetConversation() {
        if (!this.sessionId) return;
        await memory.workingMemory.clear(this.sessionId);
        this.emit('atlas.status', { phase: 'conversation_reset' });
    }

    async sendMessage(text) {
        if (!this.ready) await this.initialize();

        const trimmed = (text || '').trim();
        if (!trimmed) return '';

        const taskId = `TASK-${String(this.taskCounter++).padStart(4, '0')}`;
        const requestId = `REQ-${String(this.taskCounter++).padStart(4, '0')}`;

        try {
            const resultObj = await conversationEngine.handleMessage(trimmed, {
                memory,
                mode: this.mode,
                sessionId: this.sessionId,
                taskId,
                requestId
            });
            return resultObj; 
        } catch (err) {
            this.emit('atlas.error', { message: err.message });
            throw err;
        }
    }

    // Phase 11.6: Backend Interrupt Signal
    interrupt() {
        if (this.activeRequestId) {
            console.log(`[AtlasInterface] Interrupting active request: ${this.activeRequestId}`);
            const ttsManager = require('../voice/tts/ttsManager');
            // Pass the requestId to ttsQueue.stop() so it permanently ignores late chunks
            ttsManager.stop(this.activeRequestId);
            this.activeRequestId = null;
        }
    }

    // Phase 9F: Transcribe audio received from frontend
    async transcribeAudio(base64Audio) {
        try {
            const { createSttAdapter } = require('../voice/stt/sttAdapter');
            const stt = createSttAdapter();
            
            // Strip the data URI prefix (e.g., "data:audio/webm;base64,")
            const base64Data = base64Audio.split(',')[1];
            const audioBuffer = Buffer.from(base64Data, 'base64');
            
            const result = await stt.transcribe(audioBuffer);
            return { ok: true, text: result.text };
        } catch (error) {
            console.error('[Atlas Backend] STT failed:', error.message);
            return { ok: false, error: error.message };
        }
    }

    resolvePermission(id, decision) {
        permissionManager.resolve(id, decision);
    }

    async shutdown() {
        if (this._shutdownPromise) return this._shutdownPromise;

        this._shutdownPromise = (async () => {
            if (this.sessionId) {
                const sessionId = this.sessionId;
                this.sessionId = null;
                const lifecycleEnabled = await sessionManager.supportsReflectionLifecycle();
                if (lifecycleEnabled) {
                    // Closing the session is the durable handoff. The model call
                    // can finish during a later idle window or after restart;
                    // Electron no longer has to keep the process alive for it.
                    await sessionManager.endSession(sessionId);
                } else {
                    await this._reflectOnSession(sessionId);
                    await sessionManager.endSession(sessionId);
                }
            }
            reflectionWorker.shutdown();
            this.ready = false;
            this._initPromise = null;
            this.emit('atlas.status', { phase: 'shutdown' });
        })();

        return this._shutdownPromise;
    }
}

module.exports = { AtlasInterface };
