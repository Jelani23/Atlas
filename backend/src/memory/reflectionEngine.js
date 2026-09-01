// backend/src/memory/reflectionEngine.js
//
// Single source of truth for session reflection generation. Previously
// this logic was duplicated near-verbatim in interface/atlasInterface.js
// and the orphaned index.js CLI entrypoint - two copies of the same
// prompt and parser drifting independently. This module
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
const llmQueue = require('./llmQueue');
const { createModelAdapter } = require('../models/modelAdapter');
const { stripThinking } = require('../utils/jsonExtractor');
const memoryCache = require('../core/memoryCache');

const reflectionModelAdapter = createModelAdapter();
const REFLECTION_SCHEMA_VERSION = 3;

const REFLECTION_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string', minLength: 20 },
        category: { type: 'string', minLength: 1 },
        subject: { type: 'string', minLength: 1 },
        topics: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            minItems: 1,
            maxItems: 8
        },
        anchors: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            maxItems: 8
        },
        decisions: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            maxItems: 6
        },
        comparisons: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            maxItems: 6
        },
        open_loops: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            maxItems: 6
        }
    },
    required: [
        'summary',
        'category',
        'subject',
        'topics',
        'anchors',
        'decisions',
        'comparisons',
        'open_loops'
    ],
    additionalProperties: false
};

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
    '  "anchors": ["test_label: Exact Value", "session_theme: Exact Value"],\n' +
    '  "decisions": ["Explicit choices the user made; include a reason only when stated"],\n' +
    '  "comparisons": ["Exact A versus B distinctions discussed in the session"],\n' +
    '  "open_loops": ["Unresolved tasks, questions, or promised follow-up work"]\n' +
    '}\n' +
    'The summary is purely a record of what happened in THIS session - do not restate general facts ' +
    'about the user or the project that would belong in long-term memory or the knowledge library; ' +
    'this is session-scoped, not a durable fact store. Do not infer or save procedural rules here; ' +
    'the dedicated memory-extraction pipeline owns durable facts and procedures. Preserve decisions, ' +
    'outcomes, unresolved work, and the session\'s main direction. Prefer the user\'s wording when ' +
    'the user and assistant describe something differently. Preserve exact spelling and casing for ' +
    'named labels and themes. Anchor entries must include their role and value, not a bare value. ' +
    'Do not replace an explicit comparison with the assistant\'s interpretation. ' +
    'Open loops must come from an unresolved user request or agreed follow-up. Do not treat assistant ' +
    'confusion, clarification requests, offers, or failed answers as user intent. ' +
    'Omit passwords, tokens, temporary ' +
    'nonces, incidental identifiers, and throwaway details unless the user explicitly made one a ' +
    'project decision that must carry forward.';

function normalizeLabel(value, fallback = 'general') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function normalizeDetails(values, limit) {
    return Array.from(new Set(
        (Array.isArray(values) ? values : [])
            .map(value => String(value || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
    )).slice(0, limit);
}

function extractNamedAnchors(history) {
    const patterns = [
        ['test_label', /\b(?:reflection\s+)?test label\s*(?:is|was|=|:)\s*["“']?([^.!?\n"”']{1,100})/gi],
        ['session_theme', /\b(?:session|conversation)(?:['’]s)?\s+theme\s*(?:is|was|=|:)\s*["“']?([^.!?\n"”']{1,100})/gi],
        ['codename', /\b(?:session\s+)?codename\s*(?:is|was|=|:)\s*["“']?([^.!?\n"”']{1,100})/gi]
    ];
    const anchors = [];

    for (const message of history || []) {
        if (message?.role !== 'user') continue;
        const content = String(message.content || '');
        for (const [type, pattern] of patterns) {
            pattern.lastIndex = 0;
            for (const match of content.matchAll(pattern)) {
                anchors.push(`${type}: ${match[1].trim()}`);
            }
        }
    }

    return Array.from(new Set(anchors));
}

function mergeNamedAnchors(modelAnchors, exactAnchors) {
    const exactValues = new Set(exactAnchors.map(anchor =>
        anchor.slice(anchor.indexOf(':') + 1).trim().toLowerCase()
    ));
    const remaining = normalizeDetails(modelAnchors, 8).filter(anchor => {
        const value = anchor.includes(':')
            ? anchor.slice(anchor.indexOf(':') + 1).trim()
            : anchor.trim();
        return !exactValues.has(value.toLowerCase());
    });
    return [...exactAnchors, ...remaining].slice(0, 8);
}

function extractUserCommitments(history) {
    const comparisons = [];
    const decisions = [];
    const openLoops = [];

    for (const message of history || []) {
        if (message?.role !== 'user') continue;
        const content = String(message.content || '').trim();
        const comparison = content.match(
            /\b(?:we|i)\s+compared\s+(.+?)\s+(?:with|to|versus|vs\.?)\s+(.+?)(?:[.!?]|$)/i
        );
        if (comparison) {
            comparisons.push(`${comparison[1].trim()} vs ${comparison[2].trim()}`);
        }

        for (const sentence of content.split(/(?<=[.!?])\s+/)) {
            if (/\b(?:we|i)\s+(?:selected|chose|decided)\b/i.test(sentence) ||
                /\bour\s+(?:decision|conclusion)\b/i.test(sentence)) {
                decisions.push(sentence.replace(/[.!?]+$/, '').trim());
            }
            if (/\b(?:we|i)\s+(?:still\s+)?need to\b/i.test(sentence) ||
                /\b(?:remains?|left)\s+(?:unresolved|unfinished|to (?:do|validate|test|check|finish))\b/i.test(sentence)) {
                openLoops.push(sentence.replace(/[.!?]+$/, '').trim());
            }
        }
    }

    return {
        comparisons: Array.from(new Set(comparisons)).slice(0, 6),
        decisions: Array.from(new Set(decisions)).slice(0, 6),
        openLoops: Array.from(new Set(openLoops)).slice(0, 6)
    };
}

function hasOpenLoopSignal(history) {
    return (history || []).some(message => {
        if (message?.role !== 'user') return false;
        const content = String(message.content || '').trim();
        return content.includes('?') ||
            /\b(need to|want to|should|next|later|to-?do|follow up|pending|unresolved|not finished)\b/i.test(content) ||
            /^(please\s+)?(fix|build|add|remove|update|investigate|check|test|continue|finish|implement|review|search|look into)\b/i.test(content);
    });
}

function groundReflection(reflection, history) {
    const exactAnchors = extractNamedAnchors(history);
    const commitments = extractUserCommitments(history);
    return {
        ...reflection,
        anchors: mergeNamedAnchors(reflection.anchors, exactAnchors),
        comparisons: commitments.comparisons.length > 0
            ? commitments.comparisons
            : reflection.comparisons,
        decisions: commitments.decisions.length > 0
            ? commitments.decisions
            : reflection.decisions,
        open_loops: commitments.openLoops.length > 0
            ? commitments.openLoops
            : (hasOpenLoopSignal(history) ? reflection.open_loops : [])
    };
}

function validateReflection(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    const summary = String(parsed.summary || '').replace(/\s+/g, ' ').trim();
    const genericFallback = /various tasks and interactions|summary parsing encountered an issue/i;
    if (summary.length < 20 || genericFallback.test(summary)) {
        return null;
    }

    const detailKeys = ['anchors', 'decisions', 'comparisons', 'open_loops'];
    if (detailKeys.some(key => !Array.isArray(parsed[key]))) {
        return null;
    }

    const topics = Array.from(new Set(
        (Array.isArray(parsed.topics) ? parsed.topics : [])
            .map(topic => normalizeLabel(topic, ''))
            .filter(Boolean)
    )).slice(0, 8);

    if (topics.length === 0) {
        return null;
    }

    return {
        summary,
        category: normalizeLabel(parsed.category),
        subject: normalizeLabel(parsed.subject),
        topics,
        anchors: normalizeDetails(parsed.anchors, 8),
        decisions: normalizeDetails(parsed.decisions, 6),
        comparisons: normalizeDetails(parsed.comparisons, 6),
        open_loops: normalizeDetails(parsed.open_loops, 6),
        schema_version: REFLECTION_SCHEMA_VERSION
    };
}

function parseReflection(text) {
    const cleanText = stripThinking(text);
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return null;
    }

    try {
        return validateReflection(
            JSON.parse(cleanText.substring(firstBrace, lastBrace + 1))
        );
    } catch (e) {
        return null;
    }
}

// Preserve every turn while keeping each local-model request inside a bounded
// context window. A single oversized message is split into ordered continuation
// records rather than silently truncated.
function chunkHistory(history, maxChars = Number(process.env.REFLECTION_CHUNK_CHARS) || 9000) {
    const safeMaxChars = Math.max(2000, maxChars);
    const expanded = [];

    for (const message of history || []) {
        const role = message?.role === 'assistant' ? 'assistant' : 'user';
        const content = String(message?.content || '').trim();
        if (!content) continue;

        const segmentSize = Math.max(1000, safeMaxChars - 300);
        for (let offset = 0; offset < content.length; offset += segmentSize) {
            expanded.push({
                role,
                content: content.slice(offset, offset + segmentSize),
                continuation: offset > 0
            });
        }
    }

    const chunks = [];
    let current = [];
    let currentLength = 0;

    for (const message of expanded) {
        const serializedLength = JSON.stringify(message).length;
        if (current.length > 0 && currentLength + serializedLength > safeMaxChars) {
            chunks.push(current);
            current = [];
            currentLength = 0;
        }
        current.push(message);
        currentLength += serializedLength;
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

async function summarizeReflectionInput(input, instruction, complete = reflectionModelAdapter.complete.bind(reflectionModelAdapter)) {
    const response = await llmQueue.enqueue(() =>
        complete(
            [
                {
                    role: 'system',
                    content: `${REFLECTION_SYSTEM_PROMPT}\n${instruction}`
                },
                {
                    role: 'user',
                    content: `${JSON.stringify(input)}\n\n/no_think`
                }
            ],
            {
                think: false,
                temperature: 0.1,
                maxTokens: Number(process.env.REFLECTION_MAX_TOKENS) || 700,
                model: process.env.OLLAMA_MODEL_FAST || 'qwen3:4b',
                format: REFLECTION_SCHEMA
            }
        )
    );

    const parsed = parseReflection(response);
    if (!parsed) {
        throw new Error('Reflection model returned invalid or unusable structured output.');
    }
    return parsed;
}

async function summarizeHistory(history, options = {}) {
    const chunks = chunkHistory(history, options.maxChunkChars);
    if (chunks.length === 0) {
        throw new Error('Reflection session contains no usable messages.');
    }

    const complete = options.complete;
    if (chunks.length === 1) {
        const reflection = await summarizeReflectionInput(
            chunks[0],
            'This is the complete session transcript. Summarize only what it contains.',
            complete
        );
        return groundReflection(reflection, history);
    }

    const partials = [];
    for (let index = 0; index < chunks.length; index += 1) {
        partials.push(await summarizeReflectionInput(
            chunks[index],
            `This is transcript chunk ${index + 1} of ${chunks.length}. Capture its important session events so they survive the final merge.`,
            complete
        ));
    }

    const reflection = await summarizeReflectionInput(
        partials.map((partial, index) => ({
            chunk: index + 1,
            ...partial
        })),
        'These are ordered summaries covering every chunk of one session. Merge them into one final reflection without dropping decisions from early chunks.',
        complete
    );
    return groundReflection(reflection, history);
}

/**
 * Generate and persist a reflection for a completed session.
 *
 * - Skips sessions too short to say anything meaningful about.
 * - Guards against double-reflecting the same session (see
 *   reflectionJournal.hasReflection - also backstopped at the DB level
 *   by the partial unique index in migrations/002_reflections_upgrade.sql).
 * - Routes every chunk/model call through llmQueue, same as
 *   memoryExtractor/semanticEnricher, so reflection work is serialized with
 *   other background extraction calls on the single local Ollama GPU.
 */
async function generateReflection(sessionId, history, options = {}) {
    if (!sessionId) return { status: 'skipped', reason: 'missing_session' };
    if (!history || history.length < 3) {
        return { status: 'skipped', reason: 'too_short' };
    }

    const existing = await reflectionJournal.getForSession(sessionId);
    if (
        existing &&
        Number(existing.schema_version || 1) >= REFLECTION_SCHEMA_VERSION &&
        options.force !== true
    ) {
        return { status: 'exists' };
    }

    const parsed = await summarizeHistory(history, options);

    const entry = {
        sessionId,
        summary: parsed.summary,
        category: parsed.category,
        subject: parsed.subject,
        topics: parsed.topics,
        anchors: parsed.anchors,
        decisions: parsed.decisions,
        comparisons: parsed.comparisons,
        openLoops: parsed.open_loops,
        schemaVersion: REFLECTION_SCHEMA_VERSION,
        sourceMessageCount: history.length,
        confidence: 1.0
    };

    if (existing) {
        await reflectionJournal.replace(entry);
    } else {
        await reflectionJournal.append(entry);
    }
    memoryCache.invalidate('reflections');
    return {
        status: existing ? 'updated' : 'saved',
        reflection: parsed
    };
}

module.exports = {
    generateReflection,
    summarizeHistory,
    summarizeReflectionInput,
    chunkHistory,
    parseReflection,
    validateReflection,
    hasOpenLoopSignal,
    groundReflection,
    extractNamedAnchors,
    mergeNamedAnchors,
    extractUserCommitments,
    REFLECTION_SCHEMA_VERSION,
    REFLECTION_SCHEMA,
    REFLECTION_SYSTEM_PROMPT
};
