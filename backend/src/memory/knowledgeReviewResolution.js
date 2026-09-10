const ACTIONS = ['dismiss', 'accept_provisional'];

function validatePlan(plan) {
    if (!plan || plan.format_version !== 1 || !ACTIONS.includes(plan.action) ||
        typeof plan.reason !== 'string' || !plan.reason.trim() ||
        !/^[1-9]\d*$/.test(String(plan.review_id)) || !plan.expected_review ||
        String(plan.expected_review.id) !== String(plan.review_id) ||
        plan.expected_review.status !== 'pending' || !Object.hasOwn(plan, 'expected_current')) {
        throw new Error('A complete pending-review plan with an action and reason is required.');
    }
    if (plan.expected_current !== null && (typeof plan.expected_current !== 'object' ||
        String(plan.expected_current.id) !== String(plan.expected_review.existing_id))) {
        throw new Error('The previewed canonical record does not match this review.');
    }
    if (plan.action === 'accept_provisional') {
        const current = plan.expected_current;
        const candidate = plan.expected_review.candidate;
        if (!current || !['needs_source', 'unverified', 'failed'].includes(current.verification_status) || current.superseded_by) {
            throw new Error('Provisional acceptance cannot replace a verified, inactive, pending, or missing record.');
        }
        if (!candidate || ['category', 'subject', 'key'].some(key => candidate[key] !== current[key]) ||
            typeof candidate.value !== 'string' || !candidate.value.trim()) {
            throw new Error('Candidate identity and nonempty value must match the intended canonical record.');
        }
    }
    return plan;
}

function createPlan(details, action, reason) {
    if (!details) throw new Error('Review not found.');
    return validatePlan({ format_version: 1, review_id: details.review.id, action, reason,
        expected_review: details.review, expected_current: details.current_record });
}

async function applyPlan(client, plan) {
    validatePlan(plan);
    const { data, error } = await client.rpc('resolve_knowledge_ingestion_review', {
        p_review_id: plan.review_id, p_action: plan.action, p_reason: plan.reason,
        p_expected_review: plan.expected_review, p_expected_current: plan.expected_current
    });
    if (error) {
        const hint = ['PGRST202', '42883', '42703'].includes(error.code)
            ? ' Apply migration 012_knowledge_review_resolution.sql first.' : '';
        throw new Error(`Review resolution failed: ${error.message}.${hint}`);
    }
    if (!data || data.action !== plan.action || String(data.review_id) !== String(plan.review_id)) {
        throw new Error('Review resolution returned no matching confirmation. Inspect the review before retrying.');
    }
    return data;
}

module.exports = { createPlan, validatePlan, applyPlan };
