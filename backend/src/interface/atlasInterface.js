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

class AtlasInterface extends EventEmitter {
    constructor() {
        super();
        this.mode = personalityEngine.DEFAULT_MODE;
        this.sessionId = null;
        this.ready = false;
        this._initPromise = null;
        
        // Simple in-memory task counter (resets on restart, which is fine for now)
        this.taskCounter = 1; 

        // Initialize the debug logger
        eventLogger.initialize();

        // Bridge permission requests from the backend to the UI client
        permissionManager.on('permission.requested', (payload) => {
            this.emit('permission.requested', payload);
        });

        // Bridge Event Bus events to standardized UI events
        this._wireEventBusToUI();
    }

    _wireEventBusToUI() {
        eventBus.on(EventTypes.REQUEST_STARTED, ({ text }) => {
            this.emit('user.message', { text });
        });
        
        eventBus.on(EventTypes.TASK_PROGRESS, ({ stage }) => {
            if (stage === 'intent' || stage === 'generating') {
                this.emit('atlas.thinking', { phase: stage });
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

        // Immediate reply from the main conversation engine
        eventBus.on(EventTypes.REQUEST_COMPLETED, ({ reply }) => {
            this.emit('atlas.status', { phase: 'reply_ready' });
        });

        // Delayed reply from a background task! (This is the only time we emit 'atlas.response')
        eventBus.on(EventTypes.TASK_COMPLETED, ({ result }) => {
            if (typeof result === 'string' && result.length > 0) {
                this.emit('atlas.response', { text: result, isBackground: true });
            }
        });

        eventBus.on(EventTypes.REQUEST_FAILED, ({ error }) => {
            this.emit('atlas.error', { message: error });
        });
    }

    async initialize() {
        if (this.ready) return this.sessionId;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            await projectCache.initialize();
            this.sessionId = await sessionManager.startSession();
            this.ready = true;
            this.emit('atlas.status', { phase: 'ready', sessionId: this.sessionId });
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

    // Conversation history, for the Conversations tab's sidebar list. Sweeps
    // out empty (never-messaged) sessions first, excluding whichever one is
    // currently live, so abandoned "New conversation" clicks don't pile up.
    async listConversations() {
        await sessionManager.pruneEmptySessions(this.sessionId);
        const sessions = await sessionManager.listSessions();
        return sessions.map((s) => ({
            id: String(s.id),
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            title: s.title,
            preview: s.preview,
            isCurrent: this.sessionId != null && s.id === this.sessionId
        }));
    }

    // Full transcript for one session — either a past one being reopened, or
    // the current one being restored after a renderer reload.
    async getConversation(sessionId) {
        if (!sessionId) return [];
        return sessionManager.getSessionMessages(sessionId);
    }

    // Starts a fresh session without touching the previous one, so it stays
    // browsable in the conversation history list.
    async newConversation() {
        this.sessionId = await sessionManager.startSession();
        this.emit('atlas.status', { phase: 'new_conversation', sessionId: this.sessionId });
        return String(this.sessionId);
    }

    // Manual delete from the Conversations sidebar's right-click menu. If
    // the session being deleted is the one currently open, a fresh one is
    // started immediately so there's always a live conversation to return to.
    async deleteConversation(sessionId) {
        if (!sessionId) return { ok: false };

        const wasCurrent = this.sessionId != null && String(this.sessionId) === String(sessionId);
        await sessionManager.deleteSession(sessionId);

        let newSessionId = null;
        if (wasCurrent) {
            this.sessionId = await sessionManager.startSession();
            newSessionId = String(this.sessionId);
            this.emit('atlas.status', { phase: 'new_conversation', sessionId: this.sessionId });
        }

        return { ok: true, newSessionId };
    }

    // Manual rename from the Conversations sidebar's right-click menu.
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
            const reply = await conversationEngine.handleMessage(trimmed, {
                memory,
                mode: this.mode,
                sessionId: this.sessionId,
                taskId,
                requestId
            });
            return reply;
        } catch (err) {
            this.emit('atlas.error', { message: err.message });
            throw err;
        }
    }

    resolvePermission(id, decision) {
        permissionManager.resolve(id, decision);
    }

    async shutdown() {
        if (this.sessionId) {
            await sessionManager.endSession();
        }
        this.ready = false;
        this._initPromise = null;
        this.emit('atlas.status', { phase: 'shutdown' });
    }
}

module.exports = { AtlasInterface };