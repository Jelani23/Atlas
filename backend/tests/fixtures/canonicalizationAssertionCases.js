// Frozen before the assertion-dimension experiment. Synthetic, never world facts.
const pair = (id, key, value, oldKey, oldValue, relation) => ({
    id: `assertion_${id}`,
    incoming: { category: 'knowledge', subject: 'maple_service', key, value },
    rows: [{ id: 1, category: 'technology', subject: 'maple_service', key: oldKey, value: oldValue }],
    expected: { relation, matchedId: relation === 'distinct' ? null : 1 }
});
module.exports = [
    pair('requirement_actual', 'retention_requirement', 'The service must retain audit events for 60 days', 'event_retention', 'The service retains audit events for 14 days', 'distinct'),
    pair('proposal_actual', 'cache_candidate', 'Redis is a candidate for the cache; we have not adopted it', 'cache_backend', 'The cache uses Memcached', 'distinct'),
    pair('hypothesis_actual', 'possible_cause', 'The outage may have been caused by a DNS failure', 'incident_cause', 'The outage was caused by a disk failure', 'distinct'),
    pair('requirements_equivalent', 'encryption_requirement', 'All backups must be encrypted', 'backup_policy', 'Encryption is required for every backup', 'equivalent'),
    pair('requirements_conflict', 'retention_requirement', 'The service must retain audit events for 60 days', 'audit_policy', 'The service must retain audit events for 14 days', 'conflict'),
    pair('actual_conflict', 'cache_backend', 'The cache uses Redis', 'cache_engine', 'The cache uses Memcached', 'conflict'),
    pair('completed_transition', 'cache_backend', 'We have replaced Memcached with Redis for caching', 'cache_engine', 'The cache uses Memcached', 'update'),
    pair('past_proposal', 'cache_decision', 'We considered Redis but decided not to use it', 'cache_backend', 'The cache uses Redis', 'distinct')
];
