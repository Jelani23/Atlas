const { createMemoryModelAdapter } = require('../models/memoryModelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');
const { equivalenceRisk, procedureScopeDiffers } = require('./memoryEquivalencePolicy');
const { COMPARISON_SCHEMA, buildComparisonPrompt, comparisonToDecision } = require('./memoryIdentityComparison');
const { ASSERTION_SCHEMA, buildAssertionPrompt, assertionBoundary } = require('./memoryAssertionBoundary');

const modelAdapter = createMemoryModelAdapter();

const RELATIONS = new Set(['equivalent', 'update', 'conflict', 'distinct']);
const MIN_CONFIDENCE = 0.9;
const MAX_CANDIDATES = 10;
const DISABLED_VALUES = new Set(['false', 'disabled', 'off', '0']);


const COMMON_TOKENS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'have', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the',
    'this', 'to', 'was', 'were', 'with', 'general', 'memory'
]);

function normalizeToken(token) {
    const value = String(token || '').toLowerCase();
    if (value.length > 4 && value.endsWith('ies')) return `${value.slice(0, -3)}y`;
    if (value.length > 6 && value.endsWith('ing')) return value.slice(0, -3);
    if (value.length > 5 && value.endsWith('ed')) return value.slice(0, -2);
    if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) {
        return value.slice(0, -1);
    }
    return value;
}

function tokenize(value) {
    return [...new Set(String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normalizeToken)
        .filter(token => token.length >= 2 && !COMMON_TOKENS.has(token)))];
}

function overlap(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    if (a.size === 0 || b.size === 0) return 0;
    let shared = 0;
    for (const token of a) {
        if (b.has(token)) shared += 1;
    }
    return shared / Math.max(a.size, b.size);
}

function containmentOverlap(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    if (a.size === 0 || b.size === 0) return 0;
    let shared = 0;
    for (const token of a) {
        if (b.has(token)) shared += 1;
    }
    return shared / Math.min(a.size, b.size);
}

const SUBJECT_LABEL_TOKENS = new Set([
    'release', 'version', 'model', 'family', 'official', 'huggingface'
]);
const MODEL_QUALIFIER_TOKENS = new Set([
    'max', 'plus', 'mini', 'coder', 'chat', 'instruct', 'thinking', 'vl', 'audio', 'omni'
]);

function getSubjectQualifiers(subject) {
    return [...new Set(String(subject || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normalizeToken)
        .filter(token => token && (/\d/.test(token) || MODEL_QUALIFIER_TOKENS.has(token))))];
}

function hasConflictingSubjectQualifiers(left, right) {
    const a = new Set(getSubjectQualifiers(left));
    const b = new Set(getSubjectQualifiers(right));
    if (a.size === 0 || b.size === 0) return false;
    const leftOnly = [...a].some(token => !b.has(token));
    const rightOnly = [...b].some(token => !a.has(token));
    return leftOnly || rightOnly;
}

function getSubjectCore(subject) {
    return tokenize(subject).filter(token =>
        !SUBJECT_LABEL_TOKENS.has(token) && !getSubjectQualifiers(subject).includes(token)
    );
}

function normalizeComparable(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function candidateScopeMatches(memory, candidate) {
    if (!candidate) return false;

    if (memory.category === 'project') {
        return String(memory.project_key || '') === String(candidate.project_key || '');
    }

    if (memory.category === 'knowledge') {
        return !['superseded', 'contradicted'].includes(candidate.verification_status);
    }

    if (memory.category === 'procedure') {
        return candidate.category === 'procedure';
    }

    return candidate.category === memory.category;
}

function scoreCandidate(memory, candidate) {
    if (!candidateScopeMatches(memory, candidate)) return 0;

    const subjectScore = overlap(tokenize(memory.subject), tokenize(candidate.subject));
    const keyScore = overlap(tokenize(memory.key), tokenize(candidate.key));
    const topicScore = overlap(
        tokenize([...(memory.topics || []), memory.semantic_hint].filter(Boolean).join(' ')),
        tokenize((candidate.topics || []).join(' '))
    );
    const valueScore = overlap(tokenize(memory.value), tokenize(candidate.value));

    const exactSubject = String(memory.subject || '').toLowerCase() ===
        String(candidate.subject || '').toLowerCase();
    const exactKey = String(memory.key || '').toLowerCase() ===
        String(candidate.key || '').toLowerCase();

    return (
        subjectScore * 0.42 +
        keyScore * 0.38 +
        topicScore * 0.08 +
        valueScore * 0.12 +
        (exactSubject ? 0.12 : 0) +
        (exactKey ? 0.12 : 0)
    );
}

function selectCandidates(memory, rows, limit = MAX_CANDIDATES) {
    return (rows || [])
        .filter(row => row && row.id !== memory.id)
        .map(row => ({ row, score: scoreCandidate(memory, row) }))
        .filter(result => result.score >= 0.12)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(result => result.row);
}

function findStrongEquivalent(memory, candidates) {
    return candidates.find(candidate => {
        if (!candidateScopeMatches(memory, candidate)) return false;
        if (hasConflictingSubjectQualifiers(memory.subject, candidate.subject)) return false;
        const sameKey = normalizeComparable(memory.key) === normalizeComparable(candidate.key);
        // Similar words retrieve candidates; they do not prove semantic equality.
        // Preserve punctuation, signs and casing in values (e.g. -5 vs 5, MB vs Mb).
        const sameValue = String(memory.value ?? '').trim() === String(candidate.value ?? '').trim();
        const sameSubject = normalizeComparable(memory.subject) === normalizeComparable(candidate.subject);
        const sameProcedure = memory.category !== 'procedure' ||
            ['trigger', 'action'].every(key => memory[key] === candidate[key]);
        return sameKey && sameValue && sameSubject && sameProcedure;
    }) || null;
}

function toCandidateMemory(memory, candidate) {
    if (memory.category === 'knowledge') {
        return {
            ...candidate,
            category: 'knowledge',
            knowledge_category: candidate.category
        };
    }
    return { ...candidate };
}

function applyCanonicalIdentity(memory, candidate) {
    const canonical = { ...memory };

    if (memory.category === 'knowledge') {
        canonical.knowledge_category = candidate.category;
        canonical.subject = candidate.subject;
        canonical.key = candidate.key;
    } else if (memory.category === 'project') {
        canonical.project_key = candidate.project_key;
        canonical.subject = candidate.subject;
        canonical.key = candidate.key;
    } else if (memory.category === 'procedure') {
        canonical.subject = candidate.subject;
        canonical.key = candidate.key;
    } else {
        canonical.category = candidate.category;
        canonical.key = candidate.key;
    }

    return canonical;
}

function extractVersionTokens(value) {
    return [...new Set((String(value || '').match(/\bv?\d+(?:\.\d+){1,3}\b/gi) || [])
        .map(version => version.toLowerCase().replace(/^v/, '')))];
}

function hasDifferentVersions(left, right) {
    const leftVersions = extractVersionTokens(left);
    const rightVersions = extractVersionTokens(right);
    if (leftVersions.length === 0 || rightVersions.length === 0) return false;
    return leftVersions.some(version => !rightVersions.includes(version)) ||
        rightVersions.some(version => !leftVersions.includes(version));
}

function isCompositeValue(value) {
    // A coordinated predicate can add another claim without a semicolon.
    // This conservative veto does not split claims or treat noun lists (such
    // as supported platforms) as multiple properties.
    return /[;\n]|\b(?:and also|additionally|as well as)\b|\band\s+(?:is|are|was|were|has|have|can|will|must|should|uses|stores|supports|requires|provides|includes|runs|retains)\b/i.test(String(value || ''));
}

function validateDecision(raw, candidates, memory = null) {
    const index = raw?.candidate_index;
    const relation = String(raw?.relation || 'distinct');
    const confidence = typeof raw?.confidence === 'number' &&
        Number.isFinite(raw.confidence) && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence : 0;

    // Uncertain value agreement is not evidence that a claim is new. Preserve
    // a plausible same-identity knowledge proposal for an operator; this never
    // authorizes refresh, replacement, or verification.
    const comparison = raw?.comparison;
    const reviewIndex = comparison?.candidate_index;
    if (memory?.category === 'knowledge' && !raw?.invalidResponse &&
        Number.isInteger(reviewIndex) && reviewIndex >= 0 && reviewIndex < candidates.length &&
        comparison.entity === 'same' && comparison.scope === 'same' &&
        (comparison.property === 'uncertain' ||
            (comparison.property === 'same' && comparison.values === 'uncertain') || confidence < MIN_CONFIDENCE)) {
        const candidate = candidates[reviewIndex];
        if (candidateScopeMatches(memory, candidate) &&
            !hasConflictingSubjectQualifiers(memory.subject, candidate.subject) &&
            Boolean(getSubjectQualifiers(memory.subject).length) === Boolean(getSubjectQualifiers(candidate.subject).length)) {
            return { matched: false, reviewRequired: true, candidate, relation: 'distinct', confidence,
                reason: 'A knowledge candidate shares the entity and scope, but the comparison is uncertain; review before creating another record.' };
        }
    }

    if (relation === 'distinct') {
        return {
            matched: false,
            relation,
            confidence,
            reason: String(raw?.reason || '')
        };
    }

    if (
        !RELATIONS.has(relation) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= candidates.length ||
        confidence < MIN_CONFIDENCE
    ) {
        return {
            matched: false,
            relation: 'distinct',
            confidence,
            reason: 'Semantic identity was not established with enough confidence.'
        };
    }

    const candidate = candidates[index];
    if (memory && (
        (memory.category && !candidateScopeMatches(memory, candidate)) ||
        procedureScopeDiffers(memory, candidate) ||
        hasConflictingSubjectQualifiers(memory.subject, candidate.subject) ||
        Boolean(getSubjectQualifiers(memory.subject).length) !== Boolean(getSubjectQualifiers(candidate.subject).length)
    )) {
        return {
            matched: false,
            relation: 'distinct',
            confidence: 0,
            reason: 'The candidate crosses a memory scope or explicit entity-variant boundary.'
        };
    }
    if (relation === 'equivalent' && memory) {
        if (hasDifferentVersions(memory.value, candidate.value)) {
            return {
                matched: true,
                candidate,
                relation: 'conflict',
                confidence,
                reason: 'The memories concern the same identity but contain different version values.'
            };
        }

        const risk = equivalenceRisk(memory, candidate);
        if (risk) return { matched: false, relation: 'distinct', confidence: 0, reason: risk };

        if (
            isCompositeValue(memory.value) !== isCompositeValue(candidate.value)
        ) {
            return {
                matched: false,
                relation: 'distinct',
                confidence,
                reason: 'A composite summary cannot be merged into one of its individual claims.'
            };
        }
    }

    return {
        matched: true,
        candidate,
        relation,
        confidence,
        reason: String(raw?.reason || '')
    };
}


async function evaluateWithModel(memory, candidates, options = {}) {
    // Retry only malformed/truncated output, never a valid semantic disagreement.
    // One shared deadline bounds both requests and any optional experimental pass.
    const signal = options.signal || AbortSignal.timeout(30000);
    let decision;
    for (const maxTokens of [600, 1200]) {
        options.onModelCall?.(maxTokens === 600 ? 'identity' : 'identity_retry');
        const response = await llmQueue.enqueue(() =>
            modelAdapter.complete(
                [
                    {
                        role: 'system',
                        content: 'You compare memory identity and value agreement as separate dimensions. Return only valid JSON.'
                    },
                    {
                        role: 'user',
                        content: `${buildComparisonPrompt(memory, candidates)}\n/no_think`
                    }
                ],
                {
                    think: false,
                    temperature: 0,
                    maxTokens,
                    signal,
                    format: COMPARISON_SCHEMA
                }
            )
        );

        const parsed = extractJSON(response);
        decision = comparisonToDecision(parsed, memory, candidates);
        if (!decision.invalidResponse) break;
        options.onInvalidResponse?.();
        console.log('[MemoryCanonicalizer] Invalid response:', safePreview(response));
    }
    if (decision.invalidResponse) return decision;
    // The second-pass experiment regressed live accuracy. Only the synthetic
    // evaluator opts in; normal ingestion retains the established comparison.
    if (options.experimentalAssertionCheck !== true ||
        decision.relation === 'distinct' || decision.confidence < MIN_CONFIDENCE) return decision;
    options.onModelCall?.('assertion');
    const assertionResponse = await llmQueue.enqueue(() => modelAdapter.complete([
        { role: 'system', content: 'Classify assertion modes. Return only valid JSON.' },
        { role: 'user', content: `${buildAssertionPrompt(memory, candidates[decision.candidate_index])}\n/no_think` }
    ], { think: false, temperature: 0, maxTokens: 240, signal, format: ASSERTION_SCHEMA }));
    const assertion = extractJSON(assertionResponse);
    const boundary = assertionBoundary(assertion);
    if (boundary === 'invalid') {
        return { ...decision, candidate_index: -1, relation: 'distinct', confidence: 0, assertion, invalidResponse: true,
            reason: 'Malformed assertion comparison; defer classification.' };
    }
    if (boundary === 'different') {
        // Clear the earlier same-scope judgment so the uncertainty review guard
        // cannot retarget a requirement/proposal onto an actual-state record.
        return { ...decision, candidate_index: -1, relation: 'distinct', assertion,
            comparison: { ...decision.comparison, scope: 'different' },
            reason: 'The claims have different assertion modes; keep their identities separate.' };
    }
    if (boundary === 'uncertain') {
        return { ...decision, candidate_index: -1, relation: 'distinct', confidence: 0, assertion,
            reason: 'The assertion modes differ or are uncertain; do not combine desired or possible behavior with established behavior.' };
    }
    return { ...decision, assertion };
}

async function loadCandidates(memory, repositories = {}) {
    if (memory.category === 'knowledge') {
        const store = repositories.knowledgeLibrary || require('./knowledgeLibrary');
        return store.getAll({ throwOnError: true });
    }
    if (memory.category === 'project') {
        const store = repositories.projectMemory || require('./projectMemory');
        return store.get(memory.project_key);
    }
    if (memory.category === 'procedure') {
        const store = repositories.proceduralMemory || require('./proceduralMemory');
        return store.getAll();
    }

    const store = repositories.longTermProfile || require('./longTermProfile');
    return store.get(memory.category);
}

async function resolveMemory(memory, options = {}) {
    if (!memory || !memory.category || !memory.key) {
        return { memory, matched: false, relation: 'distinct', confidence: 0 };
    }

    if (DISABLED_VALUES.has(
        String(process.env.SEMANTIC_MEMORY_CANONICALIZATION || '').trim().toLowerCase()
    )) {
        return { memory, matched: false, relation: 'distinct', confidence: 1 };
    }

    const rows = options.rows || await loadCandidates(memory, options.repositories);
    const candidates = selectCandidates(memory, rows, options.maxCandidates);
    if (candidates.length === 0) {
        return { memory, matched: false, relation: 'distinct', confidence: 1 };
    }

    // Different version strings alone cannot establish shared property/time scope.
    // Prefer an exact duplicate; all non-exact comparisons go through semantic review.
    const strongEquivalent = findStrongEquivalent(memory, candidates);
    if (strongEquivalent) {
        return {
            memory: applyCanonicalIdentity(memory, strongEquivalent),
            matched: true,
            existing: strongEquivalent,
            candidate: strongEquivalent,
            relation: 'equivalent',
            confidence: 1,
            reason: 'The memories have the same entity, property, and value anchors.'
        };
    }

    try {
        const raw = options.evaluate
            ? await options.evaluate(memory, candidates)
            : await evaluateWithModel(memory, candidates);
        if (raw?.invalidResponse) {
            return { memory, matched: false, relation: 'distinct', confidence: 0,
                invalidResponse: true, reason: raw.reason || 'Invalid identity comparison after bounded retry.' };
        }
        const decision = validateDecision(raw, candidates, memory);

        if (!decision.matched && !decision.reviewRequired) return { memory, ...decision };

        return {
            ...decision,
            existing: decision.candidate,
            memory: applyCanonicalIdentity(memory, decision.candidate)
        };
    } catch (error) {
        console.error('[MemoryCanonicalizer] Failed:', error.message);
        return {
            memory,
            matched: false,
            relation: 'distinct',
            comparisonFailed: true,
            confidence: 0,
            reason: error.message
        };
    }
}

module.exports = {
    evaluateWithModel,
    resolveMemory,
    selectCandidates,
    scoreCandidate,
    tokenize,
    containmentOverlap,
    getSubjectQualifiers,
    hasConflictingSubjectQualifiers,
    getSubjectCore,
    findStrongEquivalent,
    extractVersionTokens,
    hasDifferentVersions,
    isCompositeValue,
    validateDecision,
    applyCanonicalIdentity,
    toCandidateMemory,
    MIN_CONFIDENCE,
    MAX_CANDIDATES
};
