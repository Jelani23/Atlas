const MAX_PLAN_STEPS = 8;

function cleanClause(value) {
    return String(value || '')
        .trim()
        .replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
        .replace(/^\s*(?:and\s+then|then|after\s+that)\s+/i, '')
        .replace(/[;]+$/, '')
        .trim();
}

function splitBy(message, pattern) {
    return String(message || '')
        .split(pattern)
        .map(cleanClause)
        .filter(Boolean)
        .slice(0, MAX_PLAN_STEPS + 1);
}

function addCandidate(candidates, seen, segments, boundary) {
    if (segments.length < 2) return;
    const key = segments.map(value => value.toLowerCase()).join('\u0000');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
        segments,
        boundary,
        overflow: segments.length > MAX_PLAN_STEPS
    });
}

function getClauseCandidates(message) {
    const text = String(message || '').trim();
    if (!text) return [];

    const candidates = [];
    const seen = new Set();

    addCandidate(
        candidates,
        seen,
        splitBy(text, /\s*(?:\r?\n+|;+|,\s*and\s+|\band\s+then\b|\bthen\b|\bafter\s+that\b)\s*/i),
        'explicit'
    );
    addCandidate(candidates, seen, splitBy(text, /[!?]\s+|\.\s+(?=[A-Za-z])/), 'explicit');
    addCandidate(candidates, seen, splitBy(text, /\s+and\s+/i), 'plain_and');

    return candidates;
}

function hasExplicitBoundary(message) {
    return /\r?\n|;|,\s*and\s+|\band\s+then\b|\bthen\b|\bafter\s+that\b|[!?]\s+|\.\s+(?=[A-Za-z])/i
        .test(String(message || ''));
}

module.exports = {
    MAX_PLAN_STEPS,
    cleanClause,
    getClauseCandidates,
    hasExplicitBoundary
};
