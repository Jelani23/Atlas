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
const { createModelAdapter } = require('../models/modelAdapter');
const { stripThinking } = require('../utils/jsonExtractor');

const reflectionModelAdapter = createModelAdapter();

// Same reflection prompt the old CLI (index.js) used at exit — kept in sync
// so summaries/learnings stay consistent regardless of which entry point
// generated them.
const REFLECTION_SYSTEM_PROMPT =
    'You are Atlas\'s reflection engine. Analyze the conversation. Return ONLY valid JSON.\n' +
    'Format: {"summary": "2-3 sentence summary of topics and tasks.", "learnings": [{"trigger": "conceptual condition", "action": "generalized behavior to follow", "context": "category"}]}\n' +
    'For "learnings", extract any implicit rules, corrections, or behaviors the user explicitly taught you (e.g., "Always do X", "Never do Y"). CRITICAL: The "trigger" MUST be a generalized concept (e.g., "When asked about system history"), NOT the exact user sentence. The "action" MUST be the generalized behavior. Do NOT extract questions or casual chat. If none, return an empty array.';

// Same JSON-parse-then-regex-fallback strategy as index.js's
// extractReflectionJSON, built on the shared stripThinking() so both entry
// points strip reasoning traces identically.
function parseReflection(text) {
    const cleanText = stripThinking(text);
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
        } catch (e) {
            const summaryMatch = cleanText.match(/"summary":\s*"([^"]+)"/i);
            const learningsMatch = cleanText.match(/"learnings":\s*(\[[\s\S]*?\])/i);

            const summary = summaryMatch ? summaryMatch[1] : null;
            let learnings = [];
            if (learningsMatch) {
                try {
                    learnings = JSON.parse(learningsMatch[1]);
                } catch (e2) {}
            }

            if (summary) return { summary, learnings };
        }
    }
    return null;
}

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
        
        // Stream LLM tokens to the UI instantly
        eventBus.on(EventTypes.LLM_TOKEN_STREAM, ({ token }) => {
            this.emit('atlas.streaming', { token });
        });
    }

    // Generates and saves a reflection for one session — the WS-server
    // equivalent of what the old CLI (index.js) only did in handleExit().
    // Safe to call for any past sessionId (workingMemory.getHistory isn't
    // tied to the "current" session), so it works whether we're reflecting
    // on the session that's about to close (shutdown) or one that was just
    // switched away from (newConversation).
    async _reflectOnSession(sessionId) {
        if (!sessionId) return;

        try {
            const history = await memory.workingMemory.getHistory(sessionId);
            if (history.length <= 2) return; // not enough to reflect on

            const fastModel = process.env.OLLAMA_MODEL_FAST || 'qwen3:4b';
            const reflectionResponse = await reflectionModelAdapter.complete(
                [
                    { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify(history) }
                ],
                { think: true, temperature: 0.3, model: fastModel }
            );

            let parsed = parseReflection(reflectionResponse);
            if (!parsed) {
                let cleanFallback = stripThinking(reflectionResponse);
                if (cleanFallback.length > 300 || cleanFallback === '') {
                    cleanFallback = "The session involved various tasks and interactions. Detailed summary parsing encountered an issue, but the session was completed successfully.";
                }
                parsed = { summary: cleanFallback, learnings: [] };
            }

            if (parsed.learnings && parsed.learnings.length > 0) {
                for (const learning of parsed.learnings) {
                    if (learning.trigger && learning.action) {
                        await memory.proceduralMemory.addProcedure({
                            trigger: learning.trigger,
                            action: learning.action,
                            context: learning.context || 'reflection_learning'
                        });
                    }
                }
            }

            await memory.reflectionJournal.append({
                sessionId,
                summary: parsed.summary
            });
        } catch (err) {
            // Never let a failed reflection take down session teardown / a
            // "new conversation" click.
            console.error('[Atlas Backend] Reflection failed:', err.message);
        }
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

    // Starts a fresh session. The outgoing one is now properly closed
    // (previously this only ever overwrote sessionId, so every past session
    // stayed open in Supabase with ended_at forever null) and reflected on
    // in the background — fire-and-forget, so "New conversation" stays
    // instant instead of waiting on an LLM call.
    async newConversation() {
        const outgoingSessionId = this.sessionId;
        if (outgoingSessionId) {
            await sessionManager.endSession();
        }

        this.sessionId = await sessionManager.startSession();
        this.emit('atlas.status', { phase: 'new_conversation', sessionId: this.sessionId });

        if (outgoingSessionId) {
            this._reflectOnSession(outgoingSessionId);
        }

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
            await this._reflectOnSession(this.sessionId);
            await sessionManager.endSession();
        }
        this.ready = false;
        this._initPromise = null;
        this.emit('atlas.status', { phase: 'shutdown' });
    }
}

module.exports = { AtlasInterface };