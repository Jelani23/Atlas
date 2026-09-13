// Frozen September 12 after the question-based comparison experiment was written.
// Recorded factual wording plus synthetic distractors, only for isolated evaluation.
// Never insert these fixtures into production memory or use them as prompt examples.
const knowledge = (subject, key, value) => ({ category: 'knowledge', knowledge_category: 'technology', subject, key, value });
const row = (memory, id = 1) => ({ ...memory, category: 'technology', id });
const pair = (id, incoming, stored, relation) => ({ id: `ownership_${id}`, incoming, rows: [row(stored)],
    expected: { relation, matchedId: relation === 'distinct' ? null : 1 } });
const sqlite = knowledge('sqlite', 'database_type', 'SQLite is an in-process database library.');
const paraphrase = knowledge('sqlite', 'database_library', "SQLite is a database library that runs within its host application's process.");
const mislabeled = knowledge('sqlite', 'database_library', 'The willow_service uses SQLite as its database engine.');
module.exports = [
    pair('sqlite_forward', paraphrase, sqlite, 'equivalent'),
    pair('sqlite_reverse', sqlite, paraphrase, 'equivalent'),
    pair('library_vs_consumer', paraphrase, mislabeled, 'distinct'),
    pair('consumer_vs_library', mislabeled, sqlite, 'distinct'),
    pair('same_labels_different_owners', mislabeled,
        knowledge('sqlite', 'database_library', 'The elm_service uses SQLite as its database engine.'), 'distinct'),
    pair('owner_despite_changed_value_label',
        knowledge('postgresql', 'database_engine', 'The willow_service now uses PostgreSQL as its database engine, replacing SQLite.'),
        knowledge('sqlite', 'database_engine', 'The willow_service uses SQLite as its database engine.'), 'update'),
    pair('owning_service_paraphrase',
        knowledge('willow_service', 'storage', 'The willow_service stores its data in a SQLite database.'),
        knowledge('willow_service', 'engine', 'The willow_service uses SQLite as its database engine.'), 'equivalent'),
    pair('different_property_same_library',
        knowledge('sqlite', 'storage_layout', 'SQLite stores a database in a single file.'), sqlite, 'distinct'),
    pair('compound_not_definition',
        knowledge('sqlite', 'definition_and_layout', 'SQLite is an in-process database library and stores a database in a single file.'), sqlite, 'distinct'),
    { id: 'ownership_correct_after_mislabeled', incoming: paraphrase,
        rows: [row(mislabeled), row(sqlite, 2)], expected: { relation: 'equivalent', matchedId: 2 } },
    { id: 'ownership_correct_after_two_mislabeled', incoming: paraphrase,
        rows: [row(mislabeled), row({ ...mislabeled, value: 'The elm_service uses SQLite as its database engine.' }, 2), row(sqlite, 3)],
        expected: { relation: 'equivalent', matchedId: 3 } }
];
