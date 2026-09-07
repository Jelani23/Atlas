const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');

const modelAdapter = createModelAdapter();

const RELATIONS = new Set(['equivalent', 'update', 'conflict', 'distinct']);
const MIN_CONFIDENCE = 0.9;
const MAX_CANDIDATES = 10;
const DISABLED_VALUES = new Set(['false', 'disabled', 'off', '0']);

const DECISION_SCHEMA = {
    type: 'object',
    properties: {
        candidate_index: { type: 'integer' },
        relation: {
            type: 'string',
            enum: ['equivalent', 'update', 'conflict', 'distinct']
        },
        confidence: { type: 'number' },
        reason: { type: 'string' }
    },
    required: ['candidate_index', 'relation', 'confidence', 'reason']
};

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
        if (hasConflictingSubjectQualifiers(memory.subject, candidate.subject)) return false;
        const sameKey = normalizeComparable(memory.key) === normalizeComparable(candidate.key);
        const sameValue = normalizeComparable(memory.value) === normalizeComparable(candidate.value);
        const subjectOverlap = overlap(tokenize(memory.subject), tokenize(candidate.subject));
        const keyOverlap = overlap(tokenize(memory.key), tokenize(candidate.key));
        const valueOverlap = overlap(tokenize(memory.value), tokenize(candidate.value));
        const topicOverlap = overlap(tokenize((memory.topics || []).join(' ')), tokenize((candidate.topics || []).join(' ')));
        const subjectCoreOverlap = containmentOverlap(
            getSubjectCore(memory.subject),
            getSubjectCore(candidate.subject)
        );
        const claimContainment = containmentOverlap(
            tokenize(`${memory.key || ''} ${memory.value || ''}`),
            tokenize(`${candidate.key || ''} ${candidate.value || ''}`)
        );
        const exactClaim = sameKey && sameValue && (subjectOverlap >= 0.5 || topicOverlap >= 0.5);
        const anchoredParaphrase =
            subjectOverlap >= 0.5 &&
            keyOverlap >= 0.75 &&
            valueOverlap >= 0.45 &&
            !hasDifferentVersions(memory.value, candidate.value) &&
            isCompositeValue(memory.value) === isCompositeValue(candidate.value);
        const labelAgnosticParaphrase =
            subjectCoreOverlap >= 0.75 &&
            claimContainment >= 0.6 &&
            !hasConflictingSubjectQualifiers(memory.subject, candidate.subject) &&
            !hasDifferentVersions(memory.value, candidate.value) &&
            isCompositeValue(memory.value) === isCompositeValue(candidate.value);
        return exactClaim || anchoredParaphrase || labelAgnosticParaphrase;
    }) || null;
}

function findStrongConflict(memory, candidates) {
    return candidates.find(candidate => {
        const subjectOverlap = overlap(tokenize(memory.subject), tokenize(candidate.subject));
        const sameKey = normalizeComparable(memory.key) === normalizeComparable(candidate.key);
        const keyOverlap = overlap(tokenize(memory.key), tokenize(candidate.key));
        return hasDifferentVersions(memory.value, candidate.value) &&
            subjectOverlap >= 0.5 &&
            (sameKey || keyOverlap >= 0.75);
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
    return /[;\n]|\b(?:and also|additionally|as well as)\b/i.test(String(value || ''));
}

function validateDecision(raw, candidates, memory = null) {
    const index = Number(raw?.candidate_index);
    const relation = String(raw?.relation || 'distinct');
    const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));

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

        if (
            normalizeComparable(memory.key) !== normalizeComparable(candidate.key) &&
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

function buildPrompt(memory, candidates) {
    const bank = memory.category;
    const incoming = {
        category: memory.category,
        project_key: memory.project_key || null,
        knowledge_category: memory.knowledge_category || null,
        subject: memory.subject || null,
        key: memory.key,
        value: memory.value,
        topics: memory.topics || [],
        trigger: memory.trigger || null,
        action: memory.action || null
    };
    const compactCandidates = candidates.map((candidate, index) => ({
        index,
        id: candidate.id,
        category: candidate.category,
        project_key: candidate.project_key || null,
        subject: candidate.subject || null,
        key: candidate.key,
        value: String(candidate.value || '').slice(0, 320),
        topics: candidate.topics || [],
        trigger: candidate.trigger || null,
        action: candidate.action || null
    }));

    return `
Decide whether one incoming ${bank} memory has the same canonical
identity as ONE stored candidate.

Canonical identity means the same real entity, preference, project
property, knowledge claim, or behavioral rule. Merely sharing a topic
is not enough. Do not merge two different properties of the same entity.
The stored subject and key are older extracted labels, not authoritative
truth. They may be worded differently or contain an obsolete version.
Compare their meaning with the value. Topics are retrieval metadata and
must never be used as evidence that two memories are different identities.
Different key wording is expected in this task and is not, by itself,
evidence of a distinct identity. Ask whether both values answer the same
property question about the same entity.

Examples:
- dark_mode_restored and dark_mode_support_restored, with values that both
  say dark mode was restored, are equivalent.
- release_date and parameter_count are distinct properties even when their
  subject is identical.
- latest_version=v1 and release_version=v2 concern the same property but
  conflict unless the incoming statement is explicitly newer.
- current_status=pending followed by an explicitly newer current_status=done
  is an update.

Relations:
- equivalent: same identity and same meaning, even if paraphrased.
- update: same identity and the incoming value is explicitly a newer
  state, correction, or replacement.
- conflict: same identity but incompatible values with no clear basis
  for choosing the incoming value as a replacement.
- distinct: none of the candidates has the same identity.

Be conservative. Prefer distinct when uncertain. Never create an index.

INCOMING:
${JSON.stringify(incoming)}

CANDIDATES:
${JSON.stringify(compactCandidates)}

Return JSON only. Use candidate_index -1 when relation is distinct.
`;
}

async function evaluateWithModel(memory, candidates) {
    const response = await llmQueue.enqueue(() =>
        modelAdapter.complete(
            [
                {
                    role: 'system',
                    content: 'You are a conservative semantic identity classifier. Return only valid JSON.'
                },
                {
                    role: 'user',
                    content: `${buildPrompt(memory, candidates)}\n/no_think`
                }
            ],
            {
                think: false,
                temperature: 0,
                maxTokens: 450,
                format: DECISION_SCHEMA
            }
        )
    );

    const parsed = extractJSON(response);
    if (!parsed) {
        console.log('[MemoryCanonicalizer] Invalid response:', safePreview(response));
        return { candidate_index: -1, relation: 'distinct', confidence: 0, reason: 'Invalid classifier response.' };
    }
    return parsed;
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

    const strongConflict = findStrongConflict(memory, candidates);
    if (strongConflict) {
        return {
            memory: applyCanonicalIdentity(memory, strongConflict),
            matched: true,
            existing: strongConflict,
            candidate: strongConflict,
            relation: 'conflict',
            confidence: 1,
            reason: 'The memories concern the same entity and property but contain different version values.'
        };
    }

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
        const decision = validateDecision(raw, candidates, memory);

        if (!decision.matched) return { memory, ...decision };

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
            confidence: 0,
            reason: error.message
        };
    }
}

module.exports = {
    resolveMemory,
    selectCandidates,
    scoreCandidate,
    tokenize,
    containmentOverlap,
    getSubjectQualifiers,
    hasConflictingSubjectQualifiers,
    getSubjectCore,
    findStrongEquivalent,
    findStrongConflict,
    extractVersionTokens,
    hasDifferentVersions,
    isCompositeValue,
    validateDecision,
    applyCanonicalIdentity,
    toCandidateMemory,
    DECISION_SCHEMA,
    MIN_CONFIDENCE,
    MAX_CANDIDATES
};
