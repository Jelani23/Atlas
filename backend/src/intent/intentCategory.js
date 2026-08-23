// backend/src/intent/intentCategory.js
//
// Derives the coarse category string ('conversation' | 'coding' |
// 'planning' | 'search' | 'memory' | 'action' | 'capability') that
// reasoningController, responseController, personalityEngine.inferMode,
// and contextManager all branch on via `intent.intent`.
//
// Previously nothing ever set this field - intentResolver.resolve() only
// returns {state, winner, params, ...}, and every downstream switch was
// silently falling through to its default case on every message (see
// conversationEngine.js's prior inline note on this). This module is the
// single place that fills it in, using three signals in priority order:
//
//   1. The tool that actually won routing (`toolResult.toolName`), mapped
//      through DOMAIN_CATEGORY - a tool actually executing is a confirmed
//      fact about this turn, and outranks Groq's guess. Groq's semantic
//      pass sees only the raw message text, not the routing outcome, so
//      it has no way to know a tool already fired.
//   2. Groq's semantic profile (`semanticProfile.taskType`), when the
//      semantic preprocessing stage ran and no tool fired - the best
//      available read on plain-conversation/coding/planning turns that
//      the regex router didn't confidently route anywhere.
//   3. Fallback: 'conversation'.
//
// This intentionally does NOT try to be clever about ambiguous cases -
// if in doubt, 'conversation' (the safest, most general response shape)
// is the right default, same as today's silent fallback, but explicit.
//
// 'capability' (plan §8/F3): questions about what Atlas/Alice itself can
// do or access ("can you read your own code?") have no dedicated
// deterministic tool/domain - there's nothing for intentResolver to route
// to - so this category can only ever arrive via signal #2, Groq's
// taskType. That's intentional: the world model is the source of truth
// for capability answers, and semantic classification (not a growing
// keyword list) is what should decide when to expose it. See
// contextBuilder.js's isCapabilityRelevant for the full 3-tier check
// (intent.intent === 'capability' is tier 1; a raw semantic profile that
// arrives without having been promoted to intent.intent is tier 2; a
// small deterministic phrase list is tier 3, a fast-path only, never the
// primary mechanism).

const { getSchemas } = require('../tools/toolRegistry');

const DOMAIN_CATEGORY = {
    FILES: 'coding',
    SEARCH: 'coding', // searchCode.js - code search, not web search
    WEB: 'search',
    MEMORY: 'memory',
    MATH: 'action',
    TEXT: 'action',
    TIME: 'action',
    NOTES: 'action',
    TASKS: 'action'
};

const VALID_CATEGORIES = new Set([
    'conversation', 'coding', 'planning', 'search', 'memory', 'action', 'capability'
]);

let toolDomainCache = null;
function getToolDomainMap() {
    if (toolDomainCache) return toolDomainCache;
    toolDomainCache = new Map();
    for (const schema of getSchemas()) {
        toolDomainCache.set(schema.name, schema.domain);
    }
    return toolDomainCache;
}

function categoryFromToolName(toolName) {
    if (!toolName) return null;
    if (toolName === 'search_web' || toolName === 'webSearch') return 'search';
    const domain = getToolDomainMap().get(toolName);
    return DOMAIN_CATEGORY[domain] || null;
}

function categoryFromSemanticProfile(semanticProfile) {
    if (!semanticProfile || typeof semanticProfile.taskType !== 'string') return null;
    const taskType = semanticProfile.taskType.toLowerCase();
    return VALID_CATEGORIES.has(taskType) ? taskType : null;
}

/**
 * @param {Object} opts
 * @param {Object} [opts.toolResult] - output of planner.route()
 * @param {Object} [opts.semanticProfile] - Groq's parsed profile, if the
 *   semantic stage ran (preprocessed.semantic)
 * @returns {string} one of VALID_CATEGORIES
 */
function deriveIntentCategory({ toolResult, semanticProfile } = {}) {
    const toolName = toolResult && toolResult.needsTool ? toolResult.toolName : null;
    const fromTool = categoryFromToolName(toolName);
    if (fromTool) return fromTool;

    const fromSemantic = categoryFromSemanticProfile(semanticProfile);
    if (fromSemantic) return fromSemantic;

    return 'conversation';
}

module.exports = { deriveIntentCategory, VALID_CATEGORIES };
