# Database activation and bounded syntax-map experiment

## Deployment state

User applied migration 017. A fresh read-only Supabase check confirmed `project_understanding` is accessible and empty (0 rows). The local backend configuration still selected JSON by default, so `backend/.env` now sets `PROJECT_UNDERSTANDING_STORAGE=supabase`. Restart the backend to load it. No production rows were inserted, no JSON memories imported/deleted, and no migration rerun was performed.

Read-only verification from backend: `node scripts/checkProjectUnderstanding.js`. It reports storage mode, table accessibility and count without exposing connection credentials or record contents. Supabase lifecycle writes remain covered by isolated repository/SQL tests; the first real database save is left to the live acceptance command below.

## Extractor

`reasoning/sourceStructure.js` uses the explicitly pinned backend dependency `typescript@5.9.3` as a JavaScript parser. It does not typecheck, execute or load inspected code. It extracts function ranges/parameters, require/import expressions, if/conditional expressions, returns, throws and CommonJS export assignments. Nested functions have separate owners; comments and strings cannot masquerade as syntax. This is not a call graph, dependency resolver or complete control-flow model.

Input must be complete contiguous numbered source. JSON is explicitly not applicable; parse errors supply no map. Output is limited to 40 entries and a 5,000-character entry budget; clipped maps are labeled. Long expressions are excerpts. These bounds mean a map may omit branches and must not be treated as full coverage.

The learning service can include this source-derived map alongside the original source. Its extractor version is included in analysis freshness when enabled, and the map is stored with that record. Experimental flag: `PROJECT_UNDERSTANDING_STRUCTURE=true`. **It defaults off**, because the first comparison did not justify enabling it. Database storage is enabled independently.

## Controlled comparison and outcome

`node scripts/auditProjectUnderstanding.js --compare` runs source-only, then source plus map, sequentially with the same configured coder, temperature 0, 8192 context, 1600 output-token limit and 45-second deadline. Separate audit stores prevent reuse between conditions. No production writes or generated-code execution occur.

Report: `backend/.local/project-understanding-audits/1790116913644/report.json`.

- Source-only completed storage/recall/unchanged skip. It repeated the incorrect classification of the string `invalid` as an invalid agent ID and omitted relevant database/cache preconditions.
- With-map produced a candidate but failed exact-quote validation; it was not saved. It also predicted that an incomplete profile passes validation, which contradicts the visible required fields, and still asked about TTL behavior already in source.
- This was one sample per condition over an already-used file, not a clean held-out benchmark or proof that structural context can never help. The maps extracted correctly; usefulness of dumping the whole map into one generation was not established. Validation was not weakened to accept the response.

No prompt retry loop, model-default change or autonomous scanning was added. Next analysis experiment should select one function/branch cluster from the map, then request exact state/input/outcome predictions and check against authored oracles. This uses structure to narrow the question rather than just increasing context volume.

## Validation and acceptance

- Offline suite: 92/92 files passed. After keeping structure opt-in, targeted structure/lifecycle/conversation tests were rerun.
- Tests cover function locations, nested ownership, false syntax in comments/strings, output limits, parse failures, incomplete source and analysis freshness across structure modes.
- Migration and repository tests remain isolated; read-only production connectivity succeeded.

After restarting:

1. `Learn Atlas file src/agents/agentProfiles.js` — expect **Saved database project understanding** if generation/citation validation succeeds. An honest generation failure is not a storage success.
2. `Recall Atlas file src/agents/agentProfiles.js` — retrieve the saved record.
3. Repeat `Learn Atlas file src/agents/agentProfiles.js` — expect unchanged reuse without generation.

No further SQL is needed. Records are still unverified interpretations and excluded from general conversational retrieval. No commits made.
