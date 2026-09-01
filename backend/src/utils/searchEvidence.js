const SEARCH_STATUS = Object.freeze({
    RESULTS_FOUND: 'SEARCH_STATUS: RESULTS_FOUND',
    NO_RESULTS: 'SEARCH_STATUS: NO_RESULTS'
});

const NO_RESULT_PATTERNS = [
    /no direct results found/i,
    /no (?:verified|usable) (?:web )?(?:results|evidence)/i,
    /^error:/i,
    /search failed for this query/i
];

function isUsableSearchResult(result) {
    const text = String(result || '').trim();
    if (text.length < 20) return false;
    return !NO_RESULT_PATTERNS.some(pattern => pattern.test(text));
}

function hasVerifiedSearchEvidence(rawResults) {
    const text = String(rawResults || '').trim();
    if (!text || text.includes(SEARCH_STATUS.NO_RESULTS)) return false;
    if (text.includes(SEARCH_STATUS.RESULTS_FOUND)) return true;

    // Compatibility with raw results created before status markers existed.
    // A synthesized answer alone never reaches this helper; callers must pass
    // the actual tool output.
    return isUsableSearchResult(text);
}

module.exports = {
    SEARCH_STATUS,
    isUsableSearchResult,
    hasVerifiedSearchEvidence
};
