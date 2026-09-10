// Held-out synthetic cases: do not use these examples in classifier prompts.
const knowledge = (subject, key, value) => ({ category: 'knowledge', subject, key, value });
const pair = (id, incoming, stored, relation) => ({
    id, incoming, rows: [{ ...stored, category: stored.category === 'knowledge' ? 'technology' : stored.category, id: 1 }],
    expected: { relation, matchedId: relation === 'distinct' ? null : 1 }
});
module.exports = [
    pair('heldout_energy_source', knowledge('harbor_ferry', 'propulsion', 'Powered by electric motors'), knowledge('harbor_ferry', 'drive_system', 'Uses electric motors for propulsion'), 'equivalent'),
    pair('heldout_capacity', knowledge('harbor_ferry', 'passenger_limit', 'Carries 120 passengers'), knowledge('harbor_ferry', 'capacity', 'Carries 80 passengers'), 'conflict'),
    pair('heldout_negation', knowledge('archive_service', 'public_access', 'The archive permits anonymous access'), knowledge('archive_service', 'anonymous_access', 'The archive does not permit anonymous access'), 'conflict'),
    pair('heldout_property_boundary', knowledge('harbor_ferry', 'launch_year', '2018'), knowledge('harbor_ferry', 'refit_year', '2018'), 'distinct'),
    pair('heldout_profile', { category: 'preferences', key: 'explanation_format', value: 'Prefers explanations with concrete examples' }, { category: 'preferences', key: 'learning_style', value: 'Likes concrete examples when learning a concept' }, 'equivalent'),
    pair('heldout_profile_boundary', { category: 'preferences', key: 'breakfast_drink', value: 'Tea' }, { category: 'preferences', key: 'evening_drink', value: 'Tea' }, 'distinct'),
    pair('heldout_update', { category: 'project', project_key: 'lighthouse', subject: 'hosting', key: 'provider', value: 'We have now moved hosting to Provider B, replacing Provider A' }, { category: 'project', project_key: 'lighthouse', subject: 'hosting', key: 'hosting_vendor', value: 'Hosting runs on Provider A' }, 'update'),
    pair('heldout_proposal', { category: 'project', project_key: 'lighthouse', subject: 'hosting', key: 'proposed_vendor', value: 'We might move to Provider B; no decision has been made' }, { category: 'project', project_key: 'lighthouse', subject: 'hosting', key: 'current_vendor', value: 'Hosting runs on Provider A' }, 'distinct'),
    pair('heldout_historical_context', knowledge('harbor_ferry', 'operator_in_2019', 'North Transit'), knowledge('harbor_ferry', 'operator_in_2024', 'South Transit'), 'distinct'),
    pair('heldout_procedure_boundary', { category: 'procedure', subject: 'backups', key: 'notification', value: 'Email the owner', trigger: 'Backup fails', action: 'Email owner' }, { category: 'procedure', subject: 'backups', key: 'notification', value: 'Email the owner', trigger: 'Backup completes', action: 'Email owner' }, 'distinct')
];
