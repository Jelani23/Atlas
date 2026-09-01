// backend/src/intent/intentResolver.js
const { extractEntities } = require('./entityExtractor');
const { getSchemas } = require('../tools/toolRegistry');
const permissionManager = require('../permissions/permissionManager'); // <-- IMPORT

// Cache compiled trigger regexes so repeated resolve() calls (every
// message) don't recompile the same pattern over and over.
const triggerRegexCache = new Map();

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Phase: Tightened trigger matching. This used to be a plain
// `lower.includes(trigger)`, which meant a short trigger like "est"
// (for the EST timezone) or "note" would match as a substring of ANY
// word containing those letters - "deepest" contains "est", "denote"
// contains "note", "euros" contains "eur", etc. That's what let
// convertTime fire on totally unrelated messages like a sentence
// ending in "...on Earth." (which contains "est" inside "deepest").
//
// Word-boundary matching fixes that, but can't be applied blindly:
// a trigger like "%" (percentage.js) is pure punctuation, and `\b%\b`
// can never match "15% of 200" - `%` sits between a digit and a
// space, and neither side is a word/non-word transition on both ends
// at once, so wrapping punctuation-only triggers in \b silently
// breaks them instead of fixing anything. Only add a boundary on
// whichever end of the trigger actually starts/ends with a word
// character - "eur" (word chars both ends) gets full \b...\b and
// correctly stops matching inside "euros", while "%" (no word chars
// at either end) falls back to a plain substring check, same as
// before.
function hasTrigger(lower, trigger) {
    let regex = triggerRegexCache.get(trigger);
    if (!regex) {
        const startsWithWordChar = /^\w/.test(trigger);
        const endsWithWordChar = /\w$/.test(trigger);
        const pattern =
            (startsWithWordChar ? '\\b' : '') +
            escapeRegex(trigger) +
            (endsWithWordChar ? '\\b' : '');
        regex = new RegExp(pattern, 'i');
        triggerRegexCache.set(trigger, regex);
    }
    return regex.test(lower);
}

function resolve(message) {
    const lower = message.toLowerCase().trim();
    const entities = extractEntities(message);
    const entityTypes = entities.map(e => e.type);

    // --- 1. GATHER LEXICAL EVIDENCE ---
    const lexical = [];
    if (/\b(search|look up|grep|references to)\b/.test(lower)) lexical.push({ signal: 'SEARCH', weight: 0.3 });
    if (/\b(calculate|math|times|plus|minus|divided|average|mean|median)\b/.test(lower)) lexical.push({ signal: 'MATH', weight: 0.4 });
    if (/\b(convert|how many|to)\b/.test(lower)) lexical.push({ signal: 'CONVERT', weight: 0.4 });
    if (/\b(note|notes|jot down|write down|take a note|take note)\b/.test(lower)) lexical.push({ signal: 'NOTES', weight: 0.4 });
    if (/\b(file|code|source|src|directory|folder|structure|module)\b/.test(lower)) lexical.push({ signal: 'FILES', weight: 0.4 });
    if (/\b(task|progress|status|background|active)\b/.test(lower)) lexical.push({ signal: 'TASKS', weight: 0.4 });
    if (/\b(time|date|timezone|jst|est|pst|gmt)\b/.test(lower)) lexical.push({ signal: 'TIME', weight: 0.5 });
    if (/\b(delete|remove)\b/.test(lower)) lexical.push({ signal: 'DELETE', weight: 0.6 });
    
    // Phase 3C.5: Tightened LIST to require "all" or "the" to prevent hijacking normal chat
    if (/\b(list all|show all|display all|list the|show the)\b/.test(lower)) lexical.push({ signal: 'LIST', weight: 0.3 });
    
    if (/\b(read|open|inspect)\b/.test(lower)) lexical.push({ signal: 'READ', weight: 0.4 });
    if (/\b(check the syntax|check syntax|validate)\b/.test(lower)) lexical.push({ signal: 'SYNTAX', weight: 0.5 });
    if (/\b(run tests|npm test|test suite)\b/.test(lower)) lexical.push({ signal: 'TEST', weight: 0.5 });
    if (/\b(word count|how many words)\b/.test(lower)) lexical.push({ signal: 'WORD_COUNT', weight: 0.5 });
    if (/\b(find|locate|where is)\b/.test(lower)) lexical.push({ signal: 'FIND', weight: 0.4 });

    // --- 2. DYNAMIC CANDIDATE SCORING ---
    const candidates = {};
    const schemas = getSchemas();

    const domainMap = {
        'FILES': ['FILES', 'FIND', 'READ', 'SYNTAX'],
        'WEB': ['SEARCH'],
        'MATH': ['MATH', 'CONVERT'],
        'TEXT': ['WORD_COUNT', 'NOTES'],
        'TIME': ['TIME'],
        'NOTES': ['NOTES'],
        'TASKS': ['TASKS', 'TEST'],
        'MEMORY': ['MEMORY']
    };

    for (const schema of schemas) {
        let score = 0;
        let matchedTriggers = 0;

        // Check triggers with word-boundary matching (fixes % bug AND
        // fixes short triggers matching inside unrelated words)
        for (const trigger of schema.triggers) {
            if (hasTrigger(lower, trigger)) {
                score += 0.6;
                matchedTriggers++;
            }
        }

        // Domain words can support a match, but cannot create one.
        const expectedLexical = domainMap[schema.domain] || [];
        for (const lex of lexical) {
            if (expectedLexical.includes(lex.signal)) {
                score += lex.weight;
            }
        }

        // Entity & Parameter Validation
        let entityMatchCount = 0;
        for (const req of schema.requiredEntities) {
            if (entityTypes.includes(req)) {
                entityMatchCount++;
                score += 0.3; 
            }
        }

        // Entities validate parameters; the trigger establishes intent.
        if (matchedTriggers === 0) continue;

        // Penalties
        if (schema.requiredEntities.length > 0 && entityMatchCount === 0) {
            score -= 0.4;
        }
        if (schema.requiredEntities.length > 1 && entityMatchCount < schema.requiredEntities.length) {
            score -= 0.5;
        }

        const params = schema.extractParams ? schema.extractParams(message, entities) : {};
        
        // Phase 3C.5: Systemic parameter validation.
        // If a tool returns null for a parameter, heavily penalize it so it falls back to the LLM.
        const hasNullParam = Array.isArray(params) ? params.includes(null) : Object.values(params).includes(null);
        if (hasNullParam) {
            score -= 0.8; 
        }

        candidates[schema.name] = {
            name: schema.name,
            score: Math.max(score, 0),
            params
        };
    }

    // --- 3. CALCULATE MARGINS & DECISION ---
    const sortedCandidates = Object.values(candidates).sort((a, b) => b.score - a.score);
    
    if (sortedCandidates.length === 0 || sortedCandidates[0].score < 0.5) {
        return { state: 'UNKNOWN', winner: null, confidence: 0, ambiguity: 1.0, llmRequired: true, entities, params: {} };
    }

    const winner = sortedCandidates[0];
    const secondBest = sortedCandidates[1] || { score: 0 };
    const margin = winner.score - secondBest.score;

    let state = 'DETERMINISTIC';
    let llmRequired = false;

    if (winner.score < 0.5) {
        state = 'UNKNOWN';
        llmRequired = true;
    } else if (margin < 0.15 && winner.score < 0.8) {
        state = 'AMBIGUOUS';
        llmRequired = false;
    }

    return {
        state,
        winner: winner.name,
        confidence: winner.score,
        secondBest: secondBest.name,
        secondConfidence: secondBest.score,
        margin,
        ambiguity: margin < 0.15 ? 0.8 : 0.1,
        params: winner.params,
        llmRequired,
        entities
    };
}

module.exports = { resolve };
