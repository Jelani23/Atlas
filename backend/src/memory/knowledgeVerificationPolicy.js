const TIME_SENSITIVE_PATTERN = /\b(?:latest|current|currently|newest|recent|release|released|version|price|benchmark|stable|status|as of|today|this year)\b|\bv?\d+\.\d+(?:\.\d+)?\b/i;
const GENERIC_ENTITY_TOKENS = new Set([
    'general', 'technology', 'software', 'release', 'releases', 'version',
    'latest', 'stable', 'current', 'changes', 'change', 'information',
    'details', 'fact', 'knowledge'
]);
const TRUSTED_VERIFICATION_METHODS = new Set(['web_search_v2', 'manual']);

function isTimeSensitive(record) {
    const text = [record.subject, record.key, record.value, ...(record.topics || [])]
        .filter(Boolean)
        .join(' ');
    return TIME_SENSITIVE_PATTERN.test(text);
}

function extractSourceUrls(evidence) {
    const matches = String(evidence || '').match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
    return [...new Set(matches.map(url => url.replace(/[.,;:!?]+$/, '')))];
}

function getEntityTokens(record) {
    const tokens = [record.subject]
        .filter(Boolean)
        .flatMap(value => String(value).toLowerCase().split(/[^a-z0-9]+/))
        .filter(token => token.length >= 3 && /^[a-z]/.test(token))
        .flatMap(token => {
            const alphaBase = token.match(/^([a-z]{3,})\d+$/)?.[1];
            return alphaBase ? [token, alphaBase] : [token];
        })
        .filter(token => !GENERIC_ENTITY_TOKENS.has(token));
    return [...new Set(tokens)];
}

function isPrimarySourceUrl(record, sourceUrl) {
    try {
        const url = new URL(sourceUrl);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const pathParts = url.pathname.toLowerCase().split('/').filter(Boolean);
        const tokens = getEntityTokens(record);
        if (tokens.some(token => host.split('.').some(part => part === token || part.startsWith(token)))) {
            return true;
        }
        if (['github.com', 'gitlab.com'].includes(host) && pathParts.length > 0) {
            return tokens.some(token => pathParts[0] === token || pathParts[0].startsWith(token));
        }
        return false;
    } catch {
        return false;
    }
}

function buildVerificationQueries(record) {
    const entity = getEntityTokens(record).join(' ') || String(record.subject || '').replace(/_/g, ' ');
    const key = String(record.key || '').replace(/_/g, ' ');
    const year = new Date().getFullYear();
    return [
        `${entity} ${key} ${year}`,
        `${entity} official ${key}`,
        `${entity} official releases`
    ].map(query => query.replace(/\s+/g, ' ').trim());
}

function getExpiry(record, verifiedAt = new Date()) {
    if (!isTimeSensitive(record)) return null;
    const ttlHours = Math.max(1, Number(process.env.KNOWLEDGE_TEMPORAL_TTL_HOURS || 24));
    return new Date(verifiedAt.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
}

function getEvidenceBlock(evidence, sourceUrl) {
    const text = String(evidence || '');
    const marker = `Source URL: ${sourceUrl}`;
    const start = text.indexOf(marker);
    if (start < 0) return '';
    const next = text.indexOf('Source URL:', start + marker.length);
    return text.slice(start, next < 0 ? text.length : next);
}

function extractVersionTokens(value) {
    return [...new Set((String(value || '').match(/\bv?\d+(?:\.\d+){1,3}\b/gi) || [])
        .map(version => version.toLowerCase().replace(/^v/, '')))];
}

function hasVersionEvidence(record, evaluation, evidence, supportingUrls) {
    const target = evaluation.verdict === 'updated'
        ? evaluation.proposed_value
        : record.value;
    const versions = extractVersionTokens(target);
    if (versions.length === 0) return true;

    const relevantUrls = isTimeSensitive(record)
        ? supportingUrls.filter(url => isPrimarySourceUrl(record, url))
        : supportingUrls;
    return relevantUrls.some(url => {
        const sourceVersions = extractVersionTokens(getEvidenceBlock(evidence, url));
        return versions.some(version => sourceVersions.includes(version));
    });
}

function validateEvaluation(evaluation, evidence, record = {}) {
    const verdicts = new Set(['confirmed', 'updated', 'contradicted', 'insufficient']);
    const verdict = verdicts.has(evaluation?.verdict) ? evaluation.verdict : 'insufficient';
    const evidenceUrls = new Set(extractSourceUrls(evidence));
    const supportingUrls = [...new Set(evaluation?.supporting_urls || [])]
        .filter(url => evidenceUrls.has(url));
    const confidence = Math.max(0, Math.min(1, Number(evaluation?.confidence) || 0));
    const proposedValue = String(evaluation?.proposed_value || '').trim();
    const sourceHosts = new Set(supportingUrls.map(url => {
        try {
            return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        } catch {
            return '';
        }
    }).filter(Boolean));
    const hasPrimarySource = supportingUrls.some(url => isPrimarySourceUrl(record, url));
    const hasSourceQuality = isTimeSensitive(record)
        ? hasPrimarySource
        : hasPrimarySource || sourceHosts.size >= 2;
    const hasSupport = supportingUrls.length > 0 && confidence >= 0.75 && hasSourceQuality;
    const decisive = verdict !== 'insufficient';

    if (decisive && !hasSupport) {
        return {
            verdict: 'insufficient',
            proposed_value: '',
            confidence,
            reason: 'The evidence did not include sufficient primary or independent source support.',
            supporting_urls: supportingUrls
        };
    }

    if (verdict === 'updated' && !proposedValue) {
        return {
            verdict: 'insufficient',
            proposed_value: '',
            confidence,
            reason: 'The evaluation proposed an update without a replacement value.',
            supporting_urls: supportingUrls
        };
    }

    if ((verdict === 'confirmed' || verdict === 'updated') &&
        !hasVersionEvidence(record, { ...evaluation, verdict, proposed_value: proposedValue }, evidence, supportingUrls)) {
        return {
            verdict: 'insufficient',
            proposed_value: '',
            confidence,
            reason: 'The cited primary evidence did not contain the version being verified.',
            supporting_urls: supportingUrls
        };
    }

    return {
        verdict,
        proposed_value: proposedValue,
        confidence,
        reason: String(evaluation?.reason || '').trim(),
        supporting_urls: supportingUrls
    };
}

module.exports = {
    TIME_SENSITIVE_PATTERN,
    isTimeSensitive,
    extractSourceUrls,
    buildVerificationQueries,
    getExpiry,
    validateEvaluation,
    getEntityTokens,
    isPrimarySourceUrl,
    getEvidenceBlock,
    extractVersionTokens,
    TRUSTED_VERIFICATION_METHODS
};
