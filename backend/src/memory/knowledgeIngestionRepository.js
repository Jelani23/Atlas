function createRepository(client) {
    return {
        async ingest(candidate, { expected = null, equivalent = false, forceReview = false, reason = null } = {}) {
            const { data, error } = await client.rpc('ingest_knowledge_candidate', {
                p_candidate: candidate, p_expected: expected, p_equivalent: equivalent,
                p_force_review: forceReview, p_reason: reason
            });
            if (error) {
                const hint = ['PGRST202', '42883', '42P01'].includes(error.code)
                    ? ' Apply migration 011_knowledge_ingestion_review.sql before retrying.' : '';
                throw new Error(`Knowledge ingestion failed: ${error.message}.${hint}`);
            }
            if (!data || !['inserted', 'refreshed', 'review'].includes(data.action) ||
                (data.action === 'review' ? !data.review_id : !data.record_id)) {
                throw new Error('Knowledge ingestion returned no confirmed write or review result.');
            }
            return data;
        },
        async listPending(limit = 50) {
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Review limit must be between 1 and 100.');
            const { data, error } = await client.from('knowledge_ingestion_reviews')
                .select('id, existing_id, candidate, reason, occurrences, first_seen_at, last_seen_at')
                .eq('status', 'pending').order('last_seen_at', { ascending: false }).limit(limit);
            if (error) throw new Error(`Failed to read knowledge ingestion reviews: ${error.message}`);
            return data || [];
        },
        async inspectReview(id) {
            if (!/^[1-9]\d*$/.test(String(id))) throw new Error('Review ID must be a positive integer.');
            const { data: review, error } = await client.from('knowledge_ingestion_reviews')
                .select('*').eq('id', id).maybeSingle();
            if (error) throw new Error(`Failed to read knowledge ingestion review: ${error.message}`);
            if (!review) return null;
            let current = null;
            if (review.existing_id !== null && review.existing_id !== undefined) {
                const result = await client.from('knowledge_library').select('*')
                    .eq('id', review.existing_id).maybeSingle();
                if (result.error) throw new Error(`Failed to read current knowledge record: ${result.error.message}`);
                current = result.data || null;
            }
            // Diagnostic only: matching this snapshot does not authorize acceptance.
            const snapshot = review.existing_snapshot;
            const fields = ['id', 'value', 'updated_at', 'verification_status', 'verification_attempts'];
            const changedFields = current && snapshot
                ? fields.filter(key => String(current[key]) !== String(snapshot[key])) : null;
            return { review, current_record: current, changed_since_queued: changedFields === null ? null : changedFields.length > 0,
                changed_fields: changedFields, acceptance_authorized: false };
        }
    };
}

module.exports = { createRepository };
