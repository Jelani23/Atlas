# Deployed memory acceptance — September 11

> Latest update: 014 and its SQL test are confirmed applied successfully. The subsequent Birch app test produced saved/duplicate/saved, not review. Knowledge rows 88/89 wrongly use sqlite/postgresql as their subjects for claims about birch_demo_service. Working-context merges now succeed. No test rows were changed. The rest of this file preserves the earlier Cedar test history; current factual test instructions are in `memory-factual-diagnostic-2026-09-11.md`.

## Current result: app test failed, local fixes ready

The user ran the three inputs below. The first/third were dropped as invalid project memories; the second became project_memory row 96 under Atlas. Read-only inspection found no cedar_demo_service knowledge rows. Working-context merges also failed because the deployed RPC expected a UUID while session 1276 is numeric. Foreground answers confused user reports with requests for proof.

Local fixes now pass 47 offline files and the exact cedar lifecycle with Atlas both registered and active (report `1789137105478.json`). The former empty-registry harness did not cover the failed deployment conditions. Response guidance was updated but has not yet been user-tested.

Before repeating the app test, run separately:

1. `backend/src/database/migrations/014_session_working_context.sql`
2. `backend/tests/sql/sessionWorkingContext.sql`

014 preserves existing session context and adds a numeric-ID RPC with a distinct name, avoiding the legacy UUID overload. Its test uses synthetic sessions and rolls table changes back. Then restart the backend. Row 96 has not been deleted or repaired; inspect its exact snapshot and decide cleanup or use a fresh fixture before the next test. Do not rerun migrations 011–013.

The original procedure below is retained as test history, not an instruction to rerun it before the above steps.

Migration 013 and its rollback-only SQL test succeeded per the user. The live RPC probe and read-only counts succeeded: no maintenance events, pending reviews, or overdue pending attempts. Probe script: `backend/scripts/checkKnowledgeMaintenance.js`; its deliberately invalid action is rejected before record access. It never submits recovery or undo.

## Next typed test

Restart the running Atlas app/backend so the extraction and canonicalization changes are loaded. In a new conversation, send these three messages separately, allowing background memory extraction to finish between messages:

1. `The cedar_demo_service uses SQLite as its database engine.`
2. `The cedar_demo_service stores its data in a SQLite database.`
3. `The cedar_demo_service now uses PostgreSQL as its database engine, replacing SQLite.`

This is a fictional test service. These inputs intentionally create provisional test memory and, if routed correctly, a pending proposal. Do not run a search or verification for the fictional claim. Report completion and any error/log output. Chat acknowledgments alone are not proof of persistence or canonicalization.

## Agent checks after user completion

Inspect only rows/reviews associated with this fixture and compare their actual IDs and snapshots. Expected: one active canonical knowledge row retaining SQLite, an equivalent paraphrase refresh, and one pending PostgreSQL proposal. It must remain provisional; the changed value must not silently replace the canonical claim. Inspect logs if extraction assigned another identity/category or created additional rows.

After inspecting the concrete proposal, show its before/after values before requesting any acceptance. Provisional acceptance, restart/recall, and conditional undo may then be exercised with that specific fixture. Do not apply unrelated reviews, verify the fictional service, or delete test history without a separate explicit decision. A continuing conversation may mention PostgreSQL from immediate context, so stored-state checks and later isolated recall must be assessed separately.

The broader semantic suite remains 40/50; this test closes application-path coverage, not general language accuracy. Legacy record 66 and voice/router issues remain separate follow-ups. Once application acceptance is satisfactory, resume the user's new-feature planning discussion with those limitations retained.
