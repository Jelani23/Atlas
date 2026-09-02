const { extractKeywords } = require('../utils/keywordExtractor');

const GENERIC_TERMS = new Set([
    'latest', 'current', 'newest', 'recent', 'stable', 'release', 'released',
    'releases', 'version', 'versions', 'model', 'models', 'family', 'main',
    'official', 'officially', 'knowledge', 'library', 'trusted', 'verified',
    'stored', 'without', 'search', 'searching', 'web', 'what', 'which',
    'does', 'your', 'say', 'tell', 'information', 'record', 'records',
    'internal', 'internally', 'own', 'personal', 'available', 'memory'
]);

function getKnowledgeSearchTerms(query) {
    return [...extractKeywords(query)]
        .map(term => term.replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean)
        .slice(0, 12);
}

function getKnowledgeAnchorTerms(terms) {
    return (terms || []).filter(term => !GENERIC_TERMS.has(term));
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

function isKnowledgeRowRelevant(row, terms, anchors = getKnowledgeAnchorTerms(terms)) {
    const text = getKnowledgeRowText(row);
    const requiredMatches = Math.min(2, anchors.length);
    if (requiredMatches > 0) {
        const matches = anchors.filter(term => text.includes(term)).length;
        return matches >= requiredMatches;
    }
    return (terms || []).some(term => text.includes(term));
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
        score + (String(value || '').toLowerCase().replace(/_/g, ' ').includes(term) ? weight : 0), 0), 0);
}

module.exports = {
    GENERIC_TERMS,
    getKnowledgeSearchTerms,
    getKnowledgeAnchorTerms,
    getKnowledgeRowText,
    isKnowledgeRowRelevant,
    scoreKnowledgeRow
};
