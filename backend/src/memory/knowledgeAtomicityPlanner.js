const { createModelAdapter } = require('../models/modelAdapter');
const { groundedKnowledgeTopics } = require('./knowledgeTopicPolicy');
const crypto = require('crypto');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');
const { resolveMemory } = require('./memoryCanonicalizer');
const { isKnowledgeActive } = require('./knowledgeAudit');

const adapter = createModelAdapter();
const MIN_COMPONENT_CONFIDENCE = 0.9;
const MIN_SOURCE_COVERAGE = 0.6;
const UNSAFE_ATOMIC_KEYS = new Set([
    'change', 'changes', 'detail', 'details', 'important_change', 'important_changes',
    'summary', 'overview', 'delivers', 'provides', 'includes', 'contains', 'has'
]);
const COMPOSITE_KEY_PATTERN = /(?:^|_)(?:summary|overview|details|important_changes|changes)(?:_|$)/i;
const COMPOSITE_VALUE_PATTERN = /[;\n]|,\s*(?:which|while|and)\s+/i;
const STRONG_CLAUSE_BOUNDARY = /\s*;\s*|\s*\n+\s*|,\s*(?=(?:which|while)\b)/i;

const DECOMPOSITION_SCHEMA = {
    type: 'object',
    properties: {
        is_composite: { type: 'boolean' },
        reason: { type: 'string' },
        components: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    subject: { type: 'string' },
                    key: { type: 'string' },
                    value: { type: 'string' },
                    type: { type: 'string' },
                    topics: { type: 'array', items: { type: 'string' } },
                    source_span: { type: 'string' },
                    confidence: { type: 'number' }
                },
                required: ['subject', 'key', 'value', 'type', 'topics', 'source_span', 'confidence']
            }
        }
    },
    required: ['is_composite', 'reason', 'components']
};

function looksComposite(row) {
    return COMPOSITE_KEY_PATTERN.test(String(row?.key || '')) ||
        COMPOSITE_VALUE_PATTERN.test(String(row?.value || ''));
}

function extractStrongClaimSpans(value) {
    const source = String(value || '').trim();
    if (!source) return [];
    return source.split(STRONG_CLAUSE_BOUNDARY)
        .map(part => part.trim())
        .filter(part => part.length >= 8);
}

function calculateSpanCoverage(source, spans) {
    const text = String(source || '');
    const normalized = text.toLowerCase();
    const covered = new Array(text.length).fill(false);
    for (const span of spans) {
        const needle = String(span || '').toLowerCase();
        let offset = 0;
        while (needle && offset < normalized.length) {
            const index = normalized.indexOf(needle, offset);
            if (index < 0) break;
            for (let cursor = index; cursor < index + needle.length; cursor += 1) covered[cursor] = true;
            offset = index + needle.length;
        }
    }
    const relevant = [...text].map((character, index) => /[a-z0-9]/i.test(character) ? index : -1)
        .filter(index => index >= 0);
    if (relevant.length === 0) return 0;
    return relevant.filter(index => covered[index]).length / relevant.length;
}

function extractNumbers(value) {
    return [...new Set(String(value || '').match(/\b\d+(?:\.\d+)*[a-z]?\b/gi) || [])]
        .map(number => number.toLowerCase());
}

function deriveAtomicValue(sourceSpan) {
    return String(sourceSpan || '')
        .trim()
        .replace(/^(?:which|while)\s+/i, '')
        .replace(/[.;]+$/, '')
        .trim();
}

function inferRelativeAntecedent(source, sourceSpan) {
    const span = String(sourceSpan || '').trim();
    if (!/^(?:which|who|that)\b/i.test(span)) return null;
    const spanIndex = String(source || '').toLowerCase().indexOf(span.toLowerCase());
    if (spanIndex <= 0) return null;
    const prefix = String(source).slice(0, spanIndex).replace(/[,;\s]+$/, '');
    const previousClause = prefix.split(/[;\n]/).pop().trim();
    const objectMatch = previousClause.match(
        /\b(?:supports?|includes?|adds?|features?|uses?|runs?|loads?|contains?|provides?|introduces?)\s+(.+)$/i
    );
    if (!objectMatch) return null;
    const antecedent = objectMatch[1].trim().replace(/^(?:a|an|the)\s+/i, '');
    return antecedent.length >= 2 && antecedent.length <= 100 ? antecedent : null;
}

function deriveComponentTopics(row, component) {
    return groundedKnowledgeTopics({ subject: component.subject, value: component.source_span }, row.topics);
}

function isSpecificAtomicKey(key) {
    const normalized = String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return normalized.length >= 3 &&
        !UNSAFE_ATOMIC_KEYS.has(normalized) &&
        !/^(?:delivers?|provides?|includes?|contains?|has)_/.test(normalized) &&
        !COMPOSITE_KEY_PATTERN.test(normalized);
}

function buildApplyApproval(row, components) {
    const destinations = components
        .filter(component => component.destination === 'existing_record' && component.matched_id)
        .map(component => ({
            source_span: component.source_span,
            matched_id: Number(component.matched_id)
        }));
    const destinationIds = [...new Set(destinations.map(component => component.matched_id))].sort((a, b) => a - b);
    const eligible = destinations.length === components.length && destinationIds.length >= 2;
    if (!eligible) return { eligible: false, hash: null, destinationIds: [] };

    const payload = {
        version: 1,
        source_id: Number(row.id),
        source_updated_at: row.updated_at || null,
        source_value: String(row.value || ''),
        destinations
    };
    return {
        eligible: true,
        hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20),
        destinationIds
    };
}

function validateDecomposition(row, raw) {
    if (!raw?.is_composite || !Array.isArray(raw.components)) {
        return {
            valid: false,
            reason: String(raw?.reason || 'The record was not decomposed into atomic claims.').trim(),
            components: []
        };
    }
    if (raw.components.length < 2 || raw.components.length > 8) {
        return { valid: false, reason: 'A composite record must produce between two and eight components.', components: [] };
    }

    const source = String(row.value || '');
    const sourceLower = source.toLowerCase();
    const sourceNumbers = new Set(extractNumbers(source));
    const components = [];

    for (const component of raw.components) {
        const span = String(component?.source_span || '').trim();
        const value = deriveAtomicValue(span);
        const inferredAntecedent = inferRelativeAntecedent(source, span);
        const subject = inferredAntecedent || String(component?.subject || '').trim();
        const key = String(component?.key || '').trim();
        const confidence = Number(component?.confidence) || 0;
        const numbersGrounded = extractNumbers(value).every(number => sourceNumbers.has(number));

        if (
            span.length < 8 ||
            !sourceLower.includes(span.toLowerCase()) ||
            !value || !subject || !key ||
            confidence < MIN_COMPONENT_CONFIDENCE ||
            !numbersGrounded
        ) {
            return {
                valid: false,
                reason: 'At least one proposed component was not grounded strongly enough in the stored text.',
                components: []
            };
        }

        components.push({
            subject,
            key,
            value,
            type: String(row.type || component.type || 'claim'),
            topics: deriveComponentTopics(row, { ...component, subject, source_span: span }),
            source_span: span,
            confidence
        });
    }

    if (new Set(components.map(component => component.value.toLowerCase())).size !== components.length) {
        return { valid: false, reason: 'The proposed components were not distinct.', components: [] };
    }

    const sourceCoverage = calculateSpanCoverage(source, components.map(component => component.source_span));
    if (sourceCoverage < MIN_SOURCE_COVERAGE) {
        return {
            valid: false,
            reason: 'The proposed components did not preserve enough of the stored record.',
            components: []
        };
    }

    return { valid: true, reason: String(raw.reason || '').trim(), sourceCoverage, components };
}

function buildPrompt(row, options = {}) {
    const structuralSpans = extractStrongClaimSpans(row.value);
    const structuralInstruction = options.forceComposite && structuralSpans.length >= 2
        ? `\nDeterministic parsing found these independently reviewable clause spans:\n${JSON.stringify(structuralSpans)}\nReturn one grounded component for every span and set is_composite to true. Do not decide that punctuation makes them one claim.`
        : structuralSpans.length >= 2
            ? `\nPotential clause spans detected by deterministic parsing:\n${JSON.stringify(structuralSpans)}\nTreat separate changes, capabilities, outcomes, or entity-property assertions as independently verifiable predicates.`
            : '';

    return `Split one stored knowledge record into atomic claims only when it contains multiple independently verifiable predicates.

An atomic claim should express one entity-property-value assertion. Do not add facts, dates, versions, entities, or implications that are absent from the stored value. Each component must include a source_span copied verbatim from the stored value that directly supports it. Each key must be a stable snake_case property name such as capabilities, supported_model, dark_mode_support_restored, or macos_instance_handoff_fixed. Never use a sentence verb such as delivers, provides, has, or includes as the key. Never reuse a generic summary key such as important_changes.
${structuralInstruction}

Stored record:
${JSON.stringify({
        category: row.category,
        subject: row.subject,
        key: row.key,
        value: row.value,
        type: row.type,
        topics: row.topics || []
    })}

Return JSON only. If the value is one atomic claim, set is_composite false and components to an empty array. /no_think`;
}

async function decomposeWithModel(row, options = {}) {
    const model = options.adapter || adapter;
    const run = async forceComposite => {
        const response = await llmQueue.enqueue(() => model.complete([
            { role: 'system', content: 'You are a conservative atomic-claim decomposition API. Return only valid JSON.' },
            { role: 'user', content: buildPrompt(row, { forceComposite }) }
        ], {
            think: false,
            temperature: 0,
            maxTokens: 1400,
            format: DECOMPOSITION_SCHEMA
        }));
        const parsed = extractJSON(response);
        if (!parsed) {
            console.log('[KnowledgeAtomicity] Invalid response:', safePreview(response));
            throw new Error('The atomicity model returned invalid JSON.');
        }
        return parsed;
    };

    const structuralSpans = extractStrongClaimSpans(row.value);
    const first = await run(false);
    if (!first.is_composite && structuralSpans.length >= 2) {
        const forced = await run(true);
        if (forced.is_composite) {
            forced.reason = `Deterministic parsing identified ${structuralSpans.length} independently reviewable source clauses.`;
        }
        return forced;
    }
    return first;
}

async function planAtomicDecomposition(row, rows = [], options = {}) {
    if (!row || !looksComposite(row)) {
        return { record_id: row?.id, status: 'atomic', components: [] };
    }

    const raw = options.decompose
        ? await options.decompose(row)
        : await decomposeWithModel(row, options);
    const validation = validateDecomposition(row, raw);
    if (!validation.valid) {
        return {
            record_id: row.id,
            status: 'review_required',
            reason: validation.reason,
            model_component_count: Array.isArray(raw?.components) ? raw.components.length : 0,
            components: []
        };
    }

    const candidates = rows.filter(candidate =>
        candidate.id !== row.id && isKnowledgeActive(candidate)
    );
    const components = [];
    for (const component of validation.components) {
        const memory = {
            category: 'knowledge',
            knowledge_category: row.category,
            subject: component.subject,
            key: component.key,
            value: component.value,
            type: component.type,
            topics: component.topics,
            source: row.source,
            source_type: row.source_type
        };
        const resolution = options.resolve
            ? await options.resolve(memory, candidates)
            : await resolveMemory(memory, { rows: candidates });
        const destination = resolution.relation === 'equivalent'
            ? 'existing_record'
            : resolution.relation === 'distinct' && isSpecificAtomicKey(component.key)
                ? 'proposed_insert'
                : 'review_required';
        components.push({
            ...component,
            relation: resolution.relation,
            matched_id: resolution.existing?.id || null,
            match_confidence: resolution.confidence,
            match_reason: resolution.reason || '',
            destination,
            destination_reason: resolution.relation === 'distinct' && !isSpecificAtomicKey(component.key)
                ? 'The proposed record needs a stable semantic property key before insertion.'
                : ''
        });
    }

    const coverageComplete = components.every(component =>
        ['existing_record', 'proposed_insert'].includes(component.destination)
    );
    const approval = buildApplyApproval(row, components);
    return {
        record_id: row.id,
        status: coverageComplete ? 'review_ready' : 'review_required',
        reason: validation.reason,
        source_coverage: validation.sourceCoverage,
        coverage_complete: coverageComplete,
        can_supersede_now: false,
        apply_eligible: approval.eligible,
        approval_hash: approval.hash,
        destination_ids: approval.destinationIds,
        components
    };
}

module.exports = {
    looksComposite,
    validateDecomposition,
    extractStrongClaimSpans,
    calculateSpanCoverage,
    deriveAtomicValue,
    inferRelativeAntecedent,
    deriveComponentTopics,
    isSpecificAtomicKey,
    buildApplyApproval,
    buildPrompt,
    decomposeWithModel,
    planAtomicDecomposition,
    extractNumbers,
    DECOMPOSITION_SCHEMA,
    MIN_COMPONENT_CONFIDENCE,
    MIN_SOURCE_COVERAGE
};
