const memoryCache = require('../core/memoryCache');
const { hasVerifiedSearchEvidence } = require('../utils/searchEvidence');
const {
    buildVerificationQueries,
    getExpiry,
    validateEvaluation
} = require('./knowledgeVerificationPolicy');

function buildRecordUpdate(record, evaluation, now) {
    const sources = evaluation.supporting_urls.map(url => ({ url, checked_at: now.toISOString() }));
    const common = {
        verification_method: 'web_search_v2',
        verification_sources: sources,
        verification_note: evaluation.reason || null,
        verification_error: null,
        last_checked_at: now.toISOString(),
        last_verified_at: null,
        expires_at: null
    };

    if (evaluation.verdict === 'confirmed') {
        return {
            ...common,
            verification_status: 'verified',
            confidence: evaluation.confidence,
            last_verified_at: now.toISOString(),
            expires_at: getExpiry(record, now)
        };
    }

    if (evaluation.verdict === 'updated') {
        const updatedRecord = { ...record, value: evaluation.proposed_value };
        return {
            ...common,
            value: evaluation.proposed_value,
            verification_status: 'verified',
            confidence: evaluation.confidence,
            last_verified_at: now.toISOString(),
            source: evaluation.supporting_urls[0],
            source_type: 'web_search',
            expires_at: getExpiry(updatedRecord, now)
        };
    }

    return {
        ...common,
        verification_status: evaluation.verdict === 'contradicted' ? 'contradicted' : 'unverified',
        confidence: evaluation.confidence
    };
}

function formatVerificationResult(record, evaluation, updatedRecord) {
    if (evaluation.verdict === 'confirmed') {
        return `Knowledge record ${record.id} was verified: ${updatedRecord.value}`;
    }
    if (evaluation.verdict === 'updated') {
        return `Knowledge record ${record.id} was updated and verified. Previous value: ${record.value}. Current value: ${updatedRecord.value}.`;
    }
    if (evaluation.verdict === 'contradicted') {
        return `Knowledge record ${record.id} was marked contradicted. ${evaluation.reason}`.trim();
    }
    return `Knowledge record ${record.id} remains unverified. ${evaluation.reason}`.trim();
}

async function reverifyKnowledgeRecord(recordId, dependencies = {}) {
    const repository = dependencies.repository || require('./knowledgeLibrary');
    const searchPipeline = dependencies.searchPipeline || require('../planner/searchPipeline');
    const evaluator = dependencies.evaluator || require('./knowledgeVerificationEvaluator');
    const record = await repository.getById(recordId);
    if (!record) return `Knowledge record ${recordId} was not found.`;
    if (record.verification_status === 'pending') return `Knowledge record ${recordId} already has a pending verification attempt. It was not started again.`;
    if (record.verification_status === 'superseded') return `Knowledge record ${recordId} is superseded. Reverify its active replacement instead.`;

    const queries = buildVerificationQueries(record);
    let runId = null;
    let claimed = null;
    let applied = false;

    try {
        runId = await repository.createVerificationRun({
            knowledgeId: record.id,
            query: queries.join(' | '),
            previousValue: record.value
        });
        claimed = await repository.beginVerification(record.id, record);
        if (!claimed || claimed.verification_status !== 'pending' || String(claimed.id) !== String(record.id)) {
            claimed = null;
            throw new Error('Verification ownership was not confirmed; no search or result write was performed.');
        }
        memoryCache.invalidate('knowledge_library');

        const evidence = await searchPipeline.executeSearch(queries);
        if (!hasVerifiedSearchEvidence(evidence)) {
            const result = {
                verdict: 'insufficient',
                proposed_value: '',
                confidence: 0,
                reason: 'Fresh web evidence was unavailable.',
                supporting_urls: []
            };
            const updated = await repository.applyVerification(record.id, buildRecordUpdate(record, result, new Date()), claimed);
            applied = true;
            await repository.completeVerificationRun(runId, {
                status: result.verdict,
                confidence: result.confidence,
                reason: result.reason,
                evidence: []
            });
            memoryCache.invalidate('knowledge_library');
            return formatVerificationResult(record, result, updated);
        }

        const rawEvaluation = await evaluator.evaluateKnowledge(record, evidence);
        const evaluation = validateEvaluation(rawEvaluation, evidence, record);
        const now = new Date();
        const updated = await repository.applyVerification(record.id, buildRecordUpdate(record, evaluation, now), claimed);
        applied = true;
        await repository.completeVerificationRun(runId, {
            status: evaluation.verdict,
            proposedValue: evaluation.proposed_value,
            confidence: evaluation.confidence,
            reason: evaluation.reason,
            evidence: evaluation.supporting_urls.map(url => ({ url, checked_at: now.toISOString() }))
        });
        memoryCache.invalidate('knowledge_library');
        return formatVerificationResult(record, evaluation, updated);
    } catch (error) {
        const cleanup = [];
        if (claimed && !applied) {
            cleanup.push(repository.applyVerification(record.id, {
                verification_status: 'failed', verification_error: error.message
            }, claimed));
        }
        if (runId !== null) {
            cleanup.push(repository.completeVerificationRun(runId, {
                status: 'failed',
                error: error.message
            }));
        }
        await Promise.allSettled(cleanup);
        memoryCache.invalidate('knowledge_library');
        throw error;
    }
}

module.exports = {
    reverifyKnowledgeRecord,
    buildRecordUpdate,
    formatVerificationResult
};
