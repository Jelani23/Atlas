// Conservative release filter, not a natural-language truth verifier. Ambiguous
// absence/unconditional claims are withheld, including possible false positives.
function reviewClaim(claim, packet) {
    const reasons = [];
    const text = claim.text;
    if (/\b(?:does\s+not|doesn't|do\s+not|don't|never|cannot|can't)\s+(?:explicitly\s+)?(?:emit\w*|call\w*|return\w*|modif\w*|execut\w*|cancel\w*|retry)\b|\b(?:no|neither)\s+(?:\w+\s+){0,3}(?:events?|calls?|retries)\b|\bwithout\s+(?:emitting|calling|returning|executing)\b|\b(?:events?|calls?)\s+(?:are|is)\s+(?:absent|missing)\b/i.test(text))
        reasons.push('Negative/absence claim requires semantic review; bounded evidence cannot establish it.');
    if (/\b(?:regardless|always|unconditionally)\b/i.test(text))
        reasons.push('Unconditional behavior claim requires semantic review.');
    if (/\b(?:syntax errors?|runtime (?:errors?|failures?))\b/i.test(text))
        reasons.push('Compiler findings do not by themselves establish syntax or runtime failure.');
    if (/\b(?:tests?|test suite)\b(?:(?!\b(?:not|never)\b|[.!?]\s).){0,160}\b(?:confirm|confirms|confirmed|verify|verifies|verified|passed|prove|proves)\b/i.test(text))
        reasons.push('Test-source evidence establishes intended assertions, not test execution.');
    const facts = packet.operations?.facts || [];
    const citedText = (claim.evidenceIds || []).map(id => packet.evidence?.find(e => e.id === id))
        .filter(e => e?.kind === 'excerpt').map(e => e.text).join('\n');
    for (const fact of facts) {
        if (!fact.key || !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(fact.key)) continue;
        const key = fact.key.split('.').pop();
        if (text.includes(key) && !citedText.includes(key))
            reasons.push(`Named event ${key} is absent from the cited excerpts; a source anchor elsewhere does not support this citation.`);
    }
    const related = facts.filter(f => text.includes(f.owner) && f.owner !== '<module>' && f.owner !== '<callback>' ||
        (f.key && text.includes(f.key.replace(/^.*\./, '').replace(/['"]/g, ''))));
    if (related.some(f => f.conditions.length || f.priorExits.length) &&
        /\b(?:sets?|emits?|updates?|cancels?|changes?|assigns?)\b/i.test(text) && !/\b(?:if|when|unless|only|provided|checking|guards?)\b/i.test(text))
        reasons.push('Related operations have guards or prior exits, but the behavioral claim does not state a condition.');
    // Conditions travel verbatim with related facts; we do not certify prose as
    // condition-complete by looking for a few matching keywords.
    return { status: reasons.length ? 'withheld' : 'unverified', reasons: [...new Set(reasons)],
        relatedOperationIds: related.map(f => f.id), semanticSupport: 'not_verified' };
}
function reviewClaims(claims, packet) {
    return claims.map(claim => ({ ...claim, review: reviewClaim(claim, packet) }));
}
module.exports = { reviewClaim, reviewClaims };
