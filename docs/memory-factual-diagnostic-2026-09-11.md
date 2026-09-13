# Source-backed factual diagnostic

> App result now observed: saved/saved/saved, with SQLite duplicate rows 90/91. No further manual replay is needed yet. User requires real facts only in the production app; fictional fixtures are isolated-only. The cleanup script and current failure-handling changes are documented at the top of `memory-workflow-status.md`. The procedure below is retained for reproduction after a meaningful semantic fix.

The user requested real information after the Birch synthetic test. Migration 014 is already applied/tested. The Birch correction failed: the changed engine became a second record because the extractor confused the property value with its owning entity. This diagnostic does not replace that regression or prove correction behavior.

In a new Atlas conversation, send each message separately and wait for its background extraction/save result:

1. SQLite is an in-process database library.
2. SQLite is a database library that runs within its host application's process.
3. PostgreSQL uses a client/server architecture.

Primary documentation checked September 11:

- SQLite: https://www.sqlite.org/about.html and https://www.sqlite.org/serverless.html
- PostgreSQL: https://www.postgresql.org/docs/17/tutorial-arch.html

The first two describe the same SQLite execution architecture and should share one canonical claim. The third concerns PostgreSQL and must remain separate. Capture extraction subjects, selected candidates, save results, and Alice's replies. Inspect the database afterward. Existing synthetic rows 88/89 are mislabeled sqlite/postgresql, so they may participate as candidates; match full claim meaning and actual IDs. Do not assume a clean store or remove those rows automatically.

These are true documented facts, but a user-statement ingestion is still provisional. A citation checked by the development agent does not mean Atlas has run its verification workflow. Do not promote trust merely to make the test pass. If the same facts already exist, equivalent refresh is acceptable; changing an unrelated synthetic claim is not.

Local reproduction from backend: `npm run memory:validate-lifecycle -- --live --facts`. This uses real local qwen3:4b with isolated PGlite and registered/active Atlas; production memory access is blocked. First report `1789137885194.json` duplicated the SQLite paraphrase. Second report `1789138008757.json` passed saved/duplicate/saved and persisted two provisional rows across database reopen. Treat results as mixed, not a general pass. Both reports are under `backend/.local/lifecycle-validations/`.

No runtime behavior was changed for this factual diagnostic. Broader semantic score remains 40/50; response offers to save project memory and extraction of the wrong owning subject remain open.
