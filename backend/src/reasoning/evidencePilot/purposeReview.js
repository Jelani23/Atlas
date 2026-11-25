const { reviewClaims } = require('./claimReview');

// Contract boundary, not a semantic classifier: detailed bounds and stopping-work
// claims belong to structured observations, never to accepted purpose prose.
function reviewPurpose(claims, packet) {
    return reviewClaims(claims, packet).map(claim => {
        const reasons = [...claim.review.reasons];
        if (/\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|milliseconds?|seconds?|minutes?|bytes?|kilobytes?|megabytes?|minimum|maximum|at least|at most)\b/i.test(claim.text))
            reasons.push('Numeric bounds, quantities and units are outside the purpose contract; inspect literal source observations instead.');
        if (/\b(?:abort\w*|interrupt\w*|terminat\w*|preempt\w*|kill\w*|stops?|stopping)\b|\bcancel(?:s|ling|ing)?\s+(?:running\s+|background\s+|arbitrary\s+)?(?:tasks?|work|execution)\b/i.test(claim.text))
            reasons.push('Stopping-work capability is outside the purpose contract; status changes, probes and call sites do not establish that work stops.');
        return { ...claim, review: { ...claim.review, reasons, status: reasons.length ? 'withheld' : 'unverified' } };
    });
}
module.exports = { reviewPurpose };
