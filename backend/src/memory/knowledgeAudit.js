const { KNOWN_KNOWLEDGE_TYPES, KNOWN_SOURCE_TYPES } = require('./knowledgeLibrary');
const { TRUSTED_VERIFICATION_METHODS } = require('./knowledgeVerificationPolicy');

const WEAK_FACT_SOURCES = new Set(['web_search', 'model_knowledge', 'reasoning']);
const TIME_SENSITIVE_PATTERN = /\b(?:latest|current|currently|newest|recent|release|released|version|price|benchmark|stable|status|as of|today|this year)\b|\bv?\d+\.\d+(?:\.\d+)?\b/i;
const RETRIEVAL_BLOCKING_ISSUES = new Set([
    'missing_provenance',
    'unknown_source_type',
    'unknown_knowledge_type',
    'low_confidence',
    'time_sensitive',
    'weak_source_marked_fact',
    'legacy_fact_without_source'
]);

function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
}

function auditKnowledgeRow(row) {
    const issues = [];
    const sourceType = String(row.source_type || '').trim().toLowerCase();
    const type = String(row.type || '').trim().toLowerCase();
    const searchable = [
        row.key,
        row.value,
        ...(Array.isArray(row.topics) ? row.topics : [])
    ].filter(Boolean).join(' ');
    const verificationStatus = String(row.verification_status || '').trim().toLowerCase();
    const verificationMethod = String(row.verification_method || '').trim().toLowerCase();
    const hasVerificationLifecycle = !!verificationStatus;
    const verificationSources = Array.isArray(row.verification_sources)
        ? row.verification_sources
        : [];
    const expired = !!row.expires_at && new Date(row.expires_at).getTime() <= Date.now();

    if (isBlank(row.source)) issues.push('missing_provenance');
    if (!KNOWN_SOURCE_TYPES.includes(sourceType)) issues.push('unknown_source_type');
    if (!KNOWN_KNOWLEDGE_TYPES.includes(type)) issues.push('unknown_knowledge_type');
    if (!Array.isArray(row.topics) || row.topics.length === 0) issues.push('missing_topics');
    if (Number(row.confidence) < 0.75) issues.push('low_confidence');
    if (TIME_SENSITIVE_PATTERN.test(searchable)) issues.push('time_sensitive');
    if (type === 'fact' && WEAK_FACT_SOURCES.has(sourceType)) issues.push('weak_source_marked_fact');
    if (type === 'fact' && sourceType === 'conversation' && isBlank(row.source)) {
        issues.push('legacy_fact_without_source');
    }
    if (hasVerificationLifecycle && verificationStatus !== 'verified') {
        issues.push(`verification_${verificationStatus}`);
    }
    if (verificationStatus === 'verified' && verificationSources.length === 0) {
        issues.push('verified_without_evidence');
    }
    if (verificationStatus === 'verified' && !TRUSTED_VERIFICATION_METHODS.has(verificationMethod)) {
        issues.push('legacy_verification_method');
    }
    if (expired) issues.push('verification_expired');

    const legacyBlocked = issues.some(issue => RETRIEVAL_BLOCKING_ISSUES.has(issue));
    const lifecycleBlocked = verificationStatus !== 'verified' ||
        verificationSources.length === 0 ||
        !TRUSTED_VERIFICATION_METHODS.has(verificationMethod) ||
        expired;

    return {
        id: row.id,
        identity: `${row.category || 'general'}/${row.subject || 'general'}/${row.key || 'unknown'}`,
        source_type: sourceType || null,
        type: type || null,
        confidence: row.confidence ?? null,
        verification_status: verificationStatus || null,
        issues,
        retrieval_blocked: hasVerificationLifecycle ? lifecycleBlocked : legacyBlocked
    };
}

function isKnowledgeRetrievable(row) {
    return !auditKnowledgeRow(row).retrieval_blocked;
}

function isKnowledgeActive(row) {
    const status = String(row?.verification_status || '').trim().toLowerCase();
    return !['superseded', 'contradicted'].includes(status) && !row?.superseded_by;
}

function auditKnowledgeRows(rows = []) {
    const records = rows.map(auditKnowledgeRow);
    const issueCounts = {};

    for (const record of records) {
        for (const issue of record.issues) {
            issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
    }

    return {
        summary: {
            total: records.length,
            flagged: records.filter(record => record.issues.length > 0).length,
            unflagged: records.filter(record => record.issues.length === 0).length,
            retrieval_quarantined: records.filter(record => record.retrieval_blocked).length,
            retrieval_eligible: records.filter(record => !record.retrieval_blocked).length,
            issues: issueCounts
        },
        records
    };
}

module.exports = {
    auditKnowledgeRow,
    auditKnowledgeRows,
    isKnowledgeRetrievable,
    isKnowledgeActive,
    RETRIEVAL_BLOCKING_ISSUES,
    TIME_SENSITIVE_PATTERN
};
