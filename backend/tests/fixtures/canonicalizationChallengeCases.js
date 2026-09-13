// New September 10 evaluation cases, frozen before the first live run.
// Do not copy these examples into model prompts. All entities are synthetic.
const knowledge = (subject, key, value) => ({ category: 'knowledge', subject, key, value });
const pair = (id, incoming, stored, relation) => ({ id, incoming,
    rows: [{ ...stored, category: stored.category === 'knowledge' ? 'technology' : stored.category, id: 1 }],
    expected: { relation, matchedId: relation === 'distinct' ? null : 1 } });
module.exports = [
    pair('challenge_negative_permission', knowledge('granite_gateway', 'guest_access', 'Guest logins are forbidden'), knowledge('granite_gateway', 'guest_policy', 'Guest logins are permitted'), 'conflict'),
    pair('challenge_signed_altitude', knowledge('survey_marker', 'height', 'Altitude is -12 metres'), knowledge('survey_marker', 'altitude', 'Altitude is 12 metres'), 'conflict'),
    pair('challenge_supported_platforms', knowledge('cedar_editor', 'platform_support', 'Runs on Linux only'), knowledge('cedar_editor', 'operating_systems', 'Runs on Linux and Windows'), 'conflict'),
    pair('challenge_backend_paraphrase', knowledge('granite_catalog', 'data_store', 'Catalog records are persisted in PostgreSQL'), knowledge('granite_catalog', 'database_engine', 'PostgreSQL stores the catalog records'), 'equivalent'),
    pair('challenge_hypothetical_change', { category: 'project', project_key: 'cedar', subject: 'hosting', key: 'possible_provider', value: 'We are considering Provider Z, but have not chosen it' }, { category: 'project', project_key: 'cedar', subject: 'hosting', key: 'active_provider', value: 'Provider Y hosts the service' }, 'distinct'),
    pair('challenge_historical_versions', knowledge('cedar_editor', 'release', 'In 2021 the release was v1.2'), knowledge('cedar_editor', 'release', 'In 2025 the release was v3.4'), 'distinct'),
    pair('challenge_versions_in_different_properties', knowledge('cedar_editor', 'release', 'The editor release is v3.4'), knowledge('cedar_editor', 'release', 'The bundled parser release is v1.2'), 'distinct'),
    pair('challenge_procedure_versions', { category: 'procedure', subject: 'cedar_upgrade', key: 'target', value: 'Install v3.4', trigger: 'Manual staging deployment', action: 'Install v3.4' }, { category: 'procedure', subject: 'cedar_upgrade', key: 'target', value: 'Install v1.2', trigger: 'Production rollback', action: 'Install v1.2' }, 'distinct'),
    pair('challenge_explicit_version_update', knowledge('cedar_editor', 'current_release', 'The current release is now v3.4, replacing v1.2'), knowledge('cedar_editor', 'current_release', 'The current release is v1.2'), 'update'),
    pair('challenge_requirement_not_implementation', knowledge('granite_gateway', 'audit_logs', 'Audit logs should be retained for 90 days'), knowledge('granite_gateway', 'audit_logs', 'Audit logs are retained for 30 days'), 'distinct'),
    pair('challenge_related_entity', knowledge('cedar_editor', 'license', 'MIT'), knowledge('cedar_parser', 'license', 'MIT'), 'distinct'),
    pair('challenge_same_number_different_property', knowledge('survey_marker', 'depth', '12 metres'), knowledge('survey_marker', 'width', '12 metres'), 'distinct'),
    pair('challenge_unit_case', knowledge('granite_gateway', 'throughput', '10 MB/s'), knowledge('granite_gateway', 'transfer_rate', '10 Mb/s'), 'conflict'),
    { id: 'challenge_exact_among_conflicts', incoming: knowledge('cedar_editor', 'current_release', 'v3.4'),
        rows: [{ ...knowledge('cedar_editor', 'current_release', 'v1.2'), category: 'technology', id: 1 },
            { ...knowledge('cedar_editor', 'current_release', 'v3.4'), category: 'technology', id: 2 }],
        expected: { relation: 'equivalent', matchedId: 2 } }
];
