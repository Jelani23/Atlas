// Runs only supplied fixtures through identity resolution. No memory stores or writes.
const canonicalizer = require('./memoryCanonicalizer');

async function evaluateCases(cases, { evaluate, onResult = () => {} } = {}) {
    const results = [];
    for (const test of cases) {
        if (!Array.isArray(test.rows)) throw new Error(`Fixture ${test.id} must supply rows; database loading is forbidden.`);
        const started = Date.now();
        let raw = null;
        let error = null;
        let modelCalls = 0;
        let modelRequests = 0;
        let invalidModelResponses = 0;
        const candidates = canonicalizer.selectCandidates(test.incoming, test.rows);
        const resolved = await canonicalizer.resolveMemory(test.incoming, {
            rows: test.rows,
            evaluate: async (memory, selected) => {
                modelCalls += 1;
                try {
                    raw = await evaluate(memory, selected, {
                        onModelCall: () => { modelRequests++; },
                        onInvalidResponse: () => { invalidModelResponses++; }
                    });
                    return raw;
                } catch (failure) {
                    error = failure.message;
                    throw failure;
                }
            }
        });
        const actual = { relation: resolved.relation, matchedId: resolved.matched ? resolved.existing?.id ?? null : null };
        if (resolved.reviewRequired) actual.reviewRequired = true;
        const invalidResponse = raw?.invalidResponse === true;
        const passed = !error && !invalidResponse && !resolved.reviewRequired && actual.relation === test.expected.relation && actual.matchedId === test.expected.matchedId;
        const result = {
            id: test.id, expected: test.expected, actual, passed,
            unsafeMatch: !passed && ['equivalent', 'update'].includes(actual.relation),
            candidateIds: candidates.map(candidate => candidate.id),
            expectedCandidateRetrieved: test.expected.matchedId === null ? null : candidates.some(candidate => candidate.id === test.expected.matchedId),
            modelCalls, modelRequests, invalidResponse, invalidModelResponses, raw, reason: resolved.reason || null, error, durationMs: Date.now() - started
        };
        results.push(result);
        onResult(result);
    }
    return {
        mode: 'synthetic_read_only', generatedAt: new Date().toISOString(),
        summary: {
            total: results.length, passed: results.filter(result => result.passed).length,
            unsafeMatches: results.filter(result => result.unsafeMatch).length,
            reviewProposals: results.filter(result => result.actual.reviewRequired).length,
            modelCalls: results.reduce((sum, result) => sum + result.modelCalls, 0),
            modelRequests: results.reduce((sum, result) => sum + result.modelRequests, 0),
            errors: results.filter(result => result.error).length,
            invalidResponses: results.filter(result => result.invalidResponse).length,
            invalidModelResponses: results.reduce((sum, result) => sum + result.invalidModelResponses, 0),
            candidateMisses: results.filter(result => result.expectedCandidateRetrieved === false).length
        }, results
    };
}

module.exports = { evaluateCases };
