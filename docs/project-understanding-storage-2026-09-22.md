# Structured project understanding and database preparation

Supersedes the pilot's record/refresh description. Runtime is still local by default until database storage is explicitly configured. Nothing was applied to production, no old JSON files were deleted/imported, and no commits were made.

## Record and lifecycle

Schema 2 requires cited observations plus 1-4 structured behavior predictions: symbol, precondition, concrete input, expected result, line and exact quote. The local Ollama request uses a JSON schema; independent validation still checks field bounds and exact source locations. Predictions remain `interpretation_unverified`. Schema compliance and citation matching do not verify semantics.

Freshness now combines source SHA-256 with an analysis-revision hash of schema, prompt and generation configuration (including model). A method/model change therefore invalidates an unchanged file's explanation. Existing schema-1 JSON records remain on disk but are stale; the next successful learn replaces them. Failed refreshes preserve the prior record.

`Relearn Atlas file src/agents/agentProfiles.js` explicitly regenerates even when both source and analysis revision match. `Learn` skips only when both match; `Recall` reports stale rather than displaying obsolete interpretations.

## Database storage

`memory/projectUnderstandingRepository.js` uses a dedicated `project_understanding` table, keyed by project key, agent ID and source path. The versioned JSON record retains analysis, citations, coverage, model, timestamps, source and analysis hashes. SQL checks enforce identity consistency and unverified status. Agent ownership references `agents`; RLS and grants restrict access to the service role. The project key is currently constrained to `atlas`, matching the source reader's fixed root. Multi-project root registration and broader project foreign-key integration are deferred.

The repository reports failed reads/writes, requires a returned row to confirm saving, and never silently falls back to JSON. Switching storage selects a distinct store; local records are not automatically imported. Normal project-memory retrieval still does not ingest these interpretations.

### Deployment (not performed)

1. Apply only `backend/src/database/migrations/017_project_understanding.sql` in the existing Supabase SQL editor. It requires the already-applied migration 016. It creates the new table/trigger/grants without rewriting existing memories.
2. Set `PROJECT_UNDERSTANDING_STORAGE=supabase` in backend configuration and restart. Omit the setting or use `local` to retain the pilot JSON store. Unknown values fail explicitly.
3. Run `Learn Atlas file src/agents/agentProfiles.js`. Success must say **Saved database project understanding** (or **Refreshed database** for an existing row).
4. Run `Recall Atlas file src/agents/agentProfiles.js`; repeat `Learn` to check unchanged reuse; use `Relearn` for an explicit new attempt.

Migration is rerunnable without deleting rows. No automatic schema migration or scheduling was added.

## Validation

- 91/91 offline files passed. After adding structured model output, lifecycle and real conversation integration tests passed again.
- Isolated PostgreSQL/WASM checks: migration and rerun, retained row, malformed/foreign-identity rejection, anon/authenticated denial and service-role read access.
- Repository checks: all identity filters, upsert conflict key, confirmation, mismatched owner, read and write failure propagation.
- Lifecycle checks include explicit relearn, changed analysis method and changed model with unchanged source, in addition to the pilot's persistence and failure boundaries.
- First local-model attempt omitted quote fields and was rejected. Its prediction that an incomplete profile would pass validation was also wrong on manual inspection. Report: `.local/project-understanding-audits/1790116288998/report.json`.
- Second sequential attempt with enforced schema completed save/reopen/recall/skip using one model call. Report: `.local/project-understanding-audits/1790116344319/report.json`.

Manual review of the accepted attempt: the two `validateProfile` examples are concrete and consistent with the visible guards. However, it again calls `invalid` an invalid agent ID (it passes the regex), under-specifies database/cache conditions for `getAgentProfile`, misses TTL/cache-origin examples, and asks questions the source already answers. The lifecycle and format improved; sound behavioral understanding remains unestablished. Generated tests were not executed.

## Next bounded analysis improvement

Use this file's fixed branch checklist: fresh cache; expiry at exact TTL; successful load; failed refresh from database cache; failed refresh from seed; unknown agent without seed; malformed profile. Ask for explicit setup/input/result against those branches, then manually compare predictions with existing authored `agentProfiles.test.js` oracles. Do not populate the record by copying expected answers into the analysis prompt.

Keep verification per claim. A passing test confirms only the behavior exercised by that fixed test, not every stored explanation. Missing dependencies should trigger a specific next read; visible-source questions should trigger a focused follow-up over the current source. Compare one bounded follow-up against the current single pass on fresh cases, keeping runs sequential and budgets recorded. Measure wrong predictions and missing branches, not output length. Do not add autonomous scanning or promote interpretations into general memory until these checks establish useful accuracy.
