// backend/src/memory/reflectionEngine.js
//
// Single source of truth for session reflection generation. Previously
// this logic was duplicated near-verbatim in interface/atlasInterface.js
// and the orphaned index.js CLI entrypoint - two copies of the same
// prompt, parser, and fallback text drifting independently. This module
// is that logic, written once.
//
// Reflection vs. memory (see memoryExtractor.js): memory extraction asks
// "what fact should be remembered from this message?". Reflection asks
// "what should Alice take away from this SESSION as a whole?" - it is a
// compact, session-scoped summary, not a fact extraction pass, and it
// intentionally does not touch knowledge_library.
//
// The summary text itself is written for Alice to read back later as her
// own context (see contextManager.js/contextBuilder.js), not as a human-
// readable session log for the user - see REFLECTION_SYSTEM_PROMPT below.

const reflectionJournal = require('./reflectionJournal');
const proceduralMemory = require('./proceduralMemory');
const llmQueue = require('./llmQueue');
const { createModelAdapter } = require('../models/modelAdapter');
const { stripThinking } = require('../utils/jsonExtractor');
const memoryCache = require('../core/memoryCache');

const reflectionModelAdapter = createModelAdapter();

const REFLECTION_SYSTEM_PROMPT =
    'You are Alice\'s reflection engine. You are not writing a summary for a human to read - ' +
    'you are writing a compact note that Alice herself will read back later, as part of her own ' +
    'working context, to recall what this session was about. Optimize for how quickly Alice can ' +
    'parse and use it, not for narrative prose.\n' +
    'Analyze the conversation and return ONLY valid JSON in this exact format:\n' +
    '{\n' +
    '  "summary": "A compact, factual account of what this session covered - topics discussed, ' +
    'tasks worked on, decisions made. 1-3 short sentences, plain and dense, no filler.",\n' +
    '  "category": "one short label for what KIND of session this was, e.g. \'debugging\', ' +
    '\'planning\', \'feature_work\', \'casual\', \'research\', \'design_decision\'",\n' +
    '  "subject": "the single main project or topic this session was about, e.g. \'atlas\', ' +
    '\'bindex\', \'subsynq\', or \'general\' if it wasn\'t project-specific",\n' +
    '  "topics": ["short", "lowercase", "keyword", "tags", "for", "retrieval"],\n' +
    '  "learnings": [{"trigger": "conceptual condition", "action": "generalized behavior to follow", "context": "category"}]\n' +
    '}\n' +
    'The summary is purely a record of what happened in THIS session - do not restate general facts ' +
    'about the user or the project that would belong in long-term memory or the knowledge library; ' +
    'this is session-scoped, not a durable fact store.\n' +
    'For "learnings", extract any implicit rules, corrections, or behaviors the user explicitly taught ' +
    'you (e.g., "Always do X", "Never do Y"). CRITICAL: the "trigger" MUST be a generalized concept ' +
    '(e.g., "When asked about system history"), NOT the exact user sentence. The "action" MUST be the ' +
    'generalized behavior. Do NOT extract questions or casual chat. If none, return an empty array.';

function parseReflection(text) {
    const cleanText = stripThinking(text);
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return null;
    }

    try {
        return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
    } catch (e) {
        const summaryMatch = cleanText.match(/"summary":\s*"([^"]+)"/i);
        const categoryMatch = cleanText.match(/"category":\s*"([^"]+)"/i);
        const subjectMatch = cleanText.match(/"subject":\s*"([^"]+)"/i);
        const topicsMatch = cleanText.match(/"topics":\s*(\[[^\]]*\])/i);
        const learningsMatch = cleanText.match(/"learnings":\s*(\[[\s\S]*?\])/i);

        const summary = summaryMatch ? summaryMatch[1] : null;
        if (!summary) return null;

        let topics = [];
        if (topicsMatch) {
            try { topics = JSON.parse(topicsMatch[1]); } catch (e2) {}
        }

        let learnings = [];
        if (learningsMatch) {
            try { learnings = JSON.parse(learningsMatch[1]); } catch (e2) {}
        }

        return {
            summary,
            category: categoryMatch ? categoryMatch[1] : undefined,
            subject: subjectMatch ? subjectMatch[1] : undefined,
            topics,
            learnings
        };
    }
}

/**
 * Generate and persist a reflection for a completed session.
 *
 * - Skips sessions too short to say anything meaningful about (matches
 *   the >2 message threshold both prior copies used).
 * - Guards against double-reflecting the same session (see
 *   reflectionJournal.hasReflection - also backstopped at the DB level
 *   by the partial unique index in migrations/002_reflections_upgrade.sql).
 * - Routes the model call through llmQueue, same as memoryExtractor/
 *   semanticEnricher, so it can never run concurrently with them on the
 *   single local Ollama GPU - previously this called the model directly,
 *   which was exactly the race llmQueue.js was built to prevent.
 */
async function generateReflection(sessionId, history) {
    if (!sessionId) return;
    if (!history || history.length <= 2) return;

    const alreadyReflected = await reflectionJournal.hasReflection(sessionId);
    if (alreadyReflected) return;

    try {
        const fastModel = process.env.OLLAMA_MODEL_FAST || 'qwen3:4b';

        const reflectionResponse = await llmQueue.enqueue(() =>
            reflectionModelAdapter.complete(
                [
                    { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify(history) }
                ],
                { think: true, temperature: 0.3, model: fastModel }
            )
        );

        let parsed = parseReflection(reflectionResponse);
        let confidence = 1.0;

        if (!parsed) {
            let cleanFallback = stripThinking(reflectionResponse);
            if (cleanFallback.length > 300 || cleanFallback === '') {
                cleanFallback = 'The session involved various tasks and interactions. Detailed summary parsing encountered an issue, but the session was completed successfully.';
            }
            // Parse failure -> low confidence so retrieval can
            // deprioritize this row without needing to delete it.
            parsed = { summary: cleanFallback, learnings: [] };
            confidence = 0.3;
        }

        if (parsed.learnings && parsed.learnings.length > 0) {
            for (const learning of parsed.learnings) {
                if (learning.trigger && learning.action) {
                    await proceduralMemory.addProcedure({
                        trigger: learning.trigger,
                        action: learning.action,
                        context: learning.context || 'reflection_learning'
                    });
                }
            }
        }

        await reflectionJournal.append({
            sessionId,
            summary: parsed.summary,
            category: parsed.category || 'general',
            subject: parsed.subject || 'general',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            confidence
        });
        memoryCache.invalidate('reflections');
    } catch (err) {
        console.error('[ReflectionEngine] Reflection failed:', err.message);
    }
}

module.exports = { generateReflection, parseReflection, REFLECTION_SYSTEM_PROMPT };
