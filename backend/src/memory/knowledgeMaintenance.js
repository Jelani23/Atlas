const { isDeepStrictEqual } = require('node:util');
const ACTIONS = ['recover_verification', 'undo_review'];
const RECOVERY_AGE_MS = 30 * 60 * 1000;
const positiveId = value => /^[1-9]\d*$/.test(String(value));

function validatePlan(plan, now = Date.now()) {
    if (!plan || plan.format_version !== 1 || !ACTIONS.includes(plan.action) ||
        !positiveId(plan.record_id) || typeof plan.reason !== 'string' || !plan.reason.trim()) {
        throw new Error('Maintenance requires a complete plan, action, record id, and reason.');
    }
    const row = plan.expected_current;
    if (!row || String(row.id) !== String(plan.record_id) || typeof row.value !== 'string' ||
        !Number.isFinite(Date.parse(row.updated_at)) || !Number.isSafeInteger(row.verification_attempts) ||
        row.verification_attempts < 0 || row.superseded_by) {
        throw new Error('An active canonical snapshot with its timestamp and attempt count is required.');
    }
    if (plan.action === 'recover_verification') {
        if (plan.review_id !== null || plan.expected_review !== null || row.verification_status !== 'pending' ||
            row.verification_attempts < 1 || now - Date.parse(row.updated_at) < RECOVERY_AGE_MS) {
            throw new Error('Recovery requires a pending attempt unchanged for at least 30 minutes and no review.');
        }
    } else {
        const review = plan.expected_review;
        if (!positiveId(plan.review_id) || !review || String(review.id) !== String(plan.review_id) ||
            String(review.existing_id) !== String(row.id) || review.status !== 'resolved' ||
            review.resolution_action !== 'accept_provisional' || !review.resolution_before || !review.resolution_after) {
            throw new Error('Only a reviewed provisional replacement can be undone.');
        }
        if (!['needs_source', 'unverified', 'failed'].includes(row.verification_status) ||
            !isDeepStrictEqual(row, review.resolution_after)) {
            throw new Error('The replacement changed since acceptance; undo would overwrite newer work.');
        }
        const before = review.resolution_before;
        if (['id', 'category', 'subject', 'key'].some(key => before[key] !== row[key]) ||
            typeof before.value !== 'string' || !before.value.trim()) {
            throw new Error('The saved original identity or value is invalid.');
        }
    }
    return plan;
}

function createPlan(action, current, review, reason, now = Date.now()) {
    return validatePlan({ format_version: 1, action, record_id: current?.id,
        review_id: review?.id ?? null, reason, expected_current: current,
        expected_review: review ?? null }, now);
}

async function applyPlan(client, plan) {
    validatePlan(plan);
    const { data, error } = await client.rpc('maintain_knowledge_record', {
        p_action: plan.action, p_record_id: plan.record_id, p_review_id: plan.review_id,
        p_reason: plan.reason, p_expected_current: plan.expected_current, p_expected_review: plan.expected_review
    });
    if (error) {
        const hint = ['PGRST202', '42883', '42P01'].includes(error.code) ? ' Apply migration 013_knowledge_maintenance.sql first.' : '';
        throw new Error(`Knowledge maintenance failed: ${error.message}.${hint}`);
    }
    if (!data || data.action !== plan.action || String(data.record_id) !== String(plan.record_id) ||
        String(data.review_id) !== String(plan.review_id) || !positiveId(data.event_id)) {
        throw new Error('No matching maintenance confirmation. Inspect the record and event history before retrying.');
    }
    return data;
}

module.exports = { ACTIONS, RECOVERY_AGE_MS, validatePlan, createPlan, applyPlan };
