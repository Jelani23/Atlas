// Synthetic evaluation data, never production memories or current factual claims.
const knowledge = (subject, key, value) => ({ category: 'knowledge', knowledge_category: 'technology', subject, key, value });
const row = (memory, id = 1) => ({ ...memory, category: memory.category === 'knowledge' ? 'technology' : memory.category, id });
const pair = (id, incoming, stored, relation) => ({
    id, incoming, rows: [row(stored)], expected: { relation, matchedId: relation === 'distinct' ? null : 1 }
});
module.exports = [
    pair('exact_duplicate', knowledge('cedar_server', 'storage', 'SQLite'), knowledge('cedar_server', 'storage', 'SQLite'), 'equivalent'),
    pair('paraphrase', knowledge('cedar_server', 'database_engine', 'Uses SQLite for storage'), knowledge('cedar_server', 'storage_backend', 'Data is stored in SQLite'), 'equivalent'),
    pair('negative_claim', knowledge('cedar_server', 'offline_mode', 'Offline mode is not supported'), knowledge('cedar_server', 'offline_support', 'Offline mode is supported'), 'conflict'),
    pair('different_quantity', knowledge('cedar_server', 'retention_period', 'Retention is 90 days'), knowledge('cedar_server', 'retention', 'Retention is 30 days'), 'conflict'),
    pair('units', knowledge('cedar_server', 'transfer_limit', 'The transfer limit is 10 MB'), knowledge('cedar_server', 'transfer_cap', 'The transfer limit is 10 Mb'), 'conflict'),
    pair('numeric_sign', knowledge('cedar_sensor', 'temperature', 'Temperature is -5 C'), knowledge('cedar_sensor', 'temperature_reading', 'Temperature is 5 C'), 'conflict'),
    pair('different_property', knowledge('cedar_server', 'release_date', 'January 2, 2020'), knowledge('cedar_server', 'license', 'MIT'), 'distinct'),
    pair('different_variant', knowledge('cedar_model_8b', 'capabilities', 'Supports code completion'), knowledge('cedar_model_70b', 'capabilities', 'Supports code completion'), 'distinct'),
    pair('unspecified_variant', knowledge('cedar_model', 'parameter_count', '8 billion'), knowledge('cedar_model_8b', 'parameter_count', '8 billion'), 'distinct'),
    pair('composite_claim', knowledge('cedar_server', 'changes', 'Offline mode works; export works'), knowledge('cedar_server', 'offline_support', 'Offline mode works'), 'distinct'),
    pair('platform_scope', knowledge('cedar_server', 'platforms', 'Runs on Linux only'), knowledge('cedar_server', 'supported_platforms', 'Runs on Linux and Windows'), 'conflict'),
    pair('historical_scope', knowledge('cedar_server_2020', 'database', 'SQLite'), knowledge('cedar_server_2025', 'database', 'PostgreSQL'), 'distinct'),
    pair('explicit_update', { category: 'project', project_key: 'cedar', subject: 'deployment', key: 'current_state', value: 'Deployment is now complete, replacing the earlier pending state' }, { category: 'project', project_key: 'cedar', subject: 'deployment', key: 'status', value: 'Deployment is pending' }, 'update'),
    pair('project_boundary', { category: 'project', project_key: 'cedar', subject: 'storage', key: 'backend', value: 'SQLite' }, { category: 'project', project_key: 'birch', subject: 'storage', key: 'backend', value: 'SQLite' }, 'distinct'),
    pair('profile_paraphrase', { category: 'preferences', key: 'answer_length', value: 'Prefers brief answers' }, { category: 'preferences', key: 'response_length', value: 'Likes concise responses' }, 'equivalent'),
    pair('procedure_trigger', { category: 'procedure', subject: 'notifications', key: 'delivery', value: 'Send a notification', trigger: 'Deployment fails', action: 'Notify user' }, { category: 'procedure', subject: 'notifications', key: 'delivery', value: 'Send a notification', trigger: 'Deployment succeeds', action: 'Notify user' }, 'distinct'),
    {
        id: 'candidate_selection', incoming: knowledge('cedar_server', 'storage_engine', 'Uses SQLite'),
        rows: [row(knowledge('cedar_server', 'license', 'MIT')), row(knowledge('cedar_server', 'database_backend', 'Stores data in SQLite'), 2)],
        expected: { relation: 'equivalent', matchedId: 2 }
    },
    pair('weak_lexical_alias', knowledge('cedar', 'persistence_layer', 'Durable records reside in an embedded relational engine'), knowledge('cedar', 'database_backend', 'Uses an embedded SQL database to retain data'), 'equivalent')
];
