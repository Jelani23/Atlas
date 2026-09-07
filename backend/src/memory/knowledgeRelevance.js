const { extractKeywords } = require('../utils/keywordExtractor');

const GENERIC_TERMS = new Set([
    'latest', 'current', 'newest', 'recent', 'stable', 'release', 'released',
    'releases', 'version', 'versions', 'model', 'models', 'family', 'main',
    'official', 'officially', 'knowledge', 'library', 'trusted', 'verified',
    'stored', 'without', 'search', 'searching', 'web', 'what', 'which',
    'does', 'your', 'say', 'tell', 'information', 'record', 'records',
    'internal', 'internally', 'own', 'personal', 'available', 'memory',
    'how', 'work', 'works', 'working', 'change', 'changes'
]);

function normalizeTerm(term) {
    const value = String(term || '').toLowerCase();
    if (value.length > 4 && value.endsWith('ies')) return `${value.slice(0, -3)}y`;
    if (value.length > 5 && value.endsWith('ing')) return value.slice(0, -3);
    if (value.length > 4 && value.endsWith('ed')) return value.slice(0, -2);
    if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1);
    return value;
}

const NORMALIZED_GENERIC_TERMS = new Set(
    [...GENERIC_TERMS].map(normalizeTerm)
);

function tokenizeKnowledgeText(value) {
    const tokens = String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normalizeTerm)
        .filter(Boolean);
    for (const token of [...tokens]) {
        const alphaBase = token.match(/^([a-z]{3,})\d+$/)?.[1];
        if (alphaBase) tokens.push(alphaBase);
    }
    return new Set(tokens);
}

function getKnowledgeSearchTerms(query) {
    return [...extractKeywords(query)]
        .map(term => term.replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean)
        .slice(0, 12);
}

function getKnowledgeAnchorTerms(terms) {
    return (terms || [])
        .map(normalizeTerm)
        .filter(term => !NORMALIZED_GENERIC_TERMS.has(term));
}

function getKnowledgeRowText(row) {
    return [
        row.category,
        row.subject,
        row.key,
        row.value,
        row.type,
        ...(Array.isArray(row.topics) ? row.topics : [])
    ].filter(Boolean).join(' ').toLowerCase().replace(/_/g, ' ');
}

function getKnowledgeClaimText(row) {
    return [
        row.category,
        row.subject,
        row.key,
        row.value,
        row.type
    ].filter(Boolean).join(' ').toLowerCase().replace(/_/g, ' ');
}

function asksForReleaseVersion(terms = []) {
    const set = new Set(terms);
    return ['latest', 'current', 'newest', 'stable'].some(term => set.has(term)) &&
        ['release', 'releases', 'version', 'versions'].some(term => set.has(term));
}

function matchesReleaseVersionProperty(row) {
    const keyText = String(row.key || '').toLowerCase().replace(/_/g, ' ');
    const valueText = String(row.value || '').trim();
    if (/\b(?:latest|stable|release version|version)\b/.test(keyText)) return true;
    return /\brelease\b/.test(keyText) &&
        /^(?:ollama\s+)?v?\d+(?:\.\d+){1,3}(?:\s|$)/i.test(valueText);
}

function isKnowledgeRowRelevant(row, terms, anchors = getKnowledgeAnchorTerms(terms)) {
    const claimTerms = tokenizeKnowledgeText(getKnowledgeClaimText(row));
    if (asksForReleaseVersion(terms) && !matchesReleaseVersionProperty(row)) {
        return false;
    }

    const requiredMatches = anchors.length <= 1
        ? anchors.length
        : Math.max(2, Math.ceil(anchors.length * 0.65));
    if (requiredMatches > 0) {
        const matches = anchors.filter(term => claimTerms.has(normalizeTerm(term))).length;
        return matches >= requiredMatches;
    }
    return (terms || []).some(term => claimTerms.has(normalizeTerm(term)));
}

function scoreKnowledgeRow(row, terms) {
    const fields = [
        [row.subject, 5],
        [Array.isArray(row.topics) ? row.topics.join(' ') : '', 4],
        [row.key, 3],
        [row.value, 2],
        [row.category, 1],
        [row.type, 1]
    ];
    return (terms || []).reduce((total, term) => total + fields.reduce((score, [value, weight]) =>
        score + (tokenizeKnowledgeText(value).has(normalizeTerm(term)) ? weight : 0), 0), 0);
}

module.exports = {
    GENERIC_TERMS,
    NORMALIZED_GENERIC_TERMS,
    normalizeTerm,
    tokenizeKnowledgeText,
    getKnowledgeSearchTerms,
    getKnowledgeAnchorTerms,
    getKnowledgeRowText,
    getKnowledgeClaimText,
    asksForReleaseVersion,
    matchesReleaseVersionProperty,
    isKnowledgeRowRelevant,
    scoreKnowledgeRow
};
