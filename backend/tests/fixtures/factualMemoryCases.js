// Stable factual inputs, checked against primary documentation on 2026-09-11.
// Sources are test provenance, not a claim that Atlas verified stored rows.
module.exports = [
    { message: 'SQLite is an in-process database library.', subject: 'sqlite', action: 'saved',
        source: 'https://www.sqlite.org/about.html' },
    { message: "SQLite is a database library that runs within its host application's process.", subject: 'sqlite', action: 'duplicate',
        source: 'https://www.sqlite.org/serverless.html' },
    { message: 'PostgreSQL uses a client/server architecture.', subject: 'postgresql', action: 'saved',
        source: 'https://www.postgresql.org/docs/17/tutorial-arch.html' }
];
