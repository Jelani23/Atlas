// Deployment probe: counts only, plus a deliberately invalid RPC action.
// The RPC rejects that action before selecting or updating any record.
require('dotenv').config({ quiet: true });
const client = require('../src/database/supabaseClient');

async function main() {
    const timeout = AbortSignal.timeout(30000);
    const results = await Promise.all([
        client.rpc('maintain_knowledge_record', {
            p_action: '__deployment_probe__', p_record_id: null, p_review_id: null,
            p_reason: 'Deployment probe; reject before any record access',
            p_expected_current: null, p_expected_review: null
        }).abortSignal(timeout),
        client.from('knowledge_maintenance_events').select('id', { count: 'exact', head: true }).abortSignal(timeout),
        client.from('knowledge_ingestion_reviews').select('id', { count: 'exact', head: true })
            .eq('status', 'pending').abortSignal(timeout),
        client.from('knowledge_library').select('id', { count: 'exact', head: true })
            .eq('verification_status', 'pending').is('superseded_by', null)
            .gte('verification_attempts', 1)
            .lte('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).abortSignal(timeout)
    ]);
    const [probe, events, reviews, attempts] = results;
    if (probe.error?.code !== 'P0001' || probe.error.message !== 'Maintenance requires an action, record id, and reason.') {
        throw new Error(`Unexpected maintenance probe: ${probe.error?.code || 'no error'} ${probe.error?.message || 'Inspect deployment; no valid action was submitted.'}`);
    }
    for (const result of [events, reviews, attempts]) {
        if (result.error) throw new Error(`Deployment count failed: ${result.error.message}`);
        if (!Number.isSafeInteger(result.count)) throw new Error('Deployment count unavailable.');
    }
    console.log(JSON.stringify({
        maintenance_rpc: 'reachable; invalid action rejected before record access',
        maintenance_events: events.count, pending_reviews: reviews.count,
        pending_attempts_older_than_30_minutes: attempts.count,
        changes: 'none; counts are a point-in-time snapshot, not recovery approval'
    }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
