# Agent profiles, context scope, and conversation checks

## App transcript repair — preference wording and code follow-ups

The user's app test exposed two reproducible routing gaps: “What do you remember about my game preferences?” did not receive topic-scoped recall, and a follow-up about just-read code was rejected by the current-turn implementation-evidence guard. Scoped recall now recognizes memory questions about a user's topic preferences. Code-read output is retained separately from assistant messages in session state, bound to agent ID, capped at 12,000 characters and ten minutes. Explicit source-referencing follow-ups can use it; other topics, intervening tools, session closure/reset and agent mismatch prevent reuse. It is labeled prior evidence, not a fresh file read or runtime observation. This does not add persistent cross-session source evidence or complete-file reading.

Generation guidance now explicitly avoids inferring today's activities or reasons for preferences from profile/project pointers, and discourages uncertain title/artist pairings. This is not a verified music catalogue or a guarantee against recommendation errors.

Regression coverage includes the user's exact recall wording, the actual controller read→follow-up→topic-change sequence, and evidence provenance/isolation/expiry/reset checks. Local model checks passed nine conversational cases (`1789602244911.json`), the retained-source follow-up (`1789602308268.json`), and a song request with an active Atlas workspace pointer (`1789602315078.json`). The latter did not claim the user worked on Atlas all day. Reports live under backend/.local personality/capability evaluations; these are smoke checks, not broad reliability certification.

Next acceptance: restart and repeat only the focused preference question, read agentProfiles.js followed immediately by the cache-failure question, and the unwinding request. No SQL changes are needed. User plans to commit after app acceptance; no commit was made by the agent.

## Deployment confirmed — later September 16 follow-up

The user applied migration 016. A fresh read-only check returned `agentId: alice`, `source: database`, `revision: 1`, `degraded: false`. No further SQL is required for this migration. Restart a backend still running the older code. The pending-deployment section below records the earlier handoff, not the current state.

Focus agreed with the user: (1) persona/preferences, (2) tools and Atlas/code understanding, (3) memory tables. Speech upgrades, knowledge acquisition and parallelism remain deferred until these pass realistic acceptance checks.

Code-inspection follow-up found and repaired two source-cache defects: only the first 3,000 characters were searchable, and initial hashes used truncated content while change detection used full files. The cache now retains and hashes complete contents; search uses complete indexed files, while read previews remain bounded and explicitly labeled incomplete. Search results name exact lines, report matching files rather than claiming all occurrences, and bound output to 40 files / 600 characters per matching line. New isolated tests cover tail-only evidence, unchanged/changed hashes, refreshed content and absent matches. Reading a file still returns a preview; complete range-based inspection and end-to-end read-and-explain synthesis are not established by this test.

The actual planner routed both a code-read request and a code-search request correctly in the mocked-execution audit: 24/24 total checks. Local Qwen source-evidence evaluation used the actual readCode tool on `agentProfiles.js` and correctly explained cached/degraded fallback (`1789600300190.json` in `.local/capability-evaluations`). An ownership/storage question initially gave false training-data/session-only claims because no operating guide was selected. Storage-specific guide selection was fixed without inserting it into normal taste questions; the repeated evaluation correctly distinguished `agent_profiles` from `user_profile` (`1789600346986.json`). These narrow passes do not establish general semantic reliability.

## Deployment step still required

Run only `backend/src/database/migrations/016_agent_profiles.sql` in the existing Supabase project's SQL editor, then restart the backend. Do not rerun the base schema or previous migrations. New installations also need this migration after the base schema. Migration 015 is unrelated and not a dependency.

The migration creates `agents` and `agent_profiles`, keyed by agent ID, with a versioned JSON personality document and revision counter. It seeds every current `atlasState` value for Alice without overwriting an existing profile. Human preferences remain in `user_profile`. RLS is enabled; only service-role access is granted. This is agent identity storage, not a completed multi-agent session or human-memory isolation system.

`node scripts/checkAgentProfile.js` from backend is read-only. Success requires source `database`. The live pre-deployment check returned `seed_fallback` / `PGRST205`: the REST schema cache does not expose the table. No production migration or data writes were performed in this pass.

## Runtime behavior

- `ATLAS_AGENT_ID` defaults to `alice`. A single loaded snapshot supplies both prompt compilation and deterministic preference comparisons for a turn, before planning can execute tools.
- Database profiles are cached for 30 seconds. A failed read can use the last known database snapshot, explicitly marked degraded. Alice alone has her existing local profile as a migration/outage seed. Unknown agents cannot borrow Alice's identity; malformed/version-mismatched profiles fail validation.
- `atlasState` remains a compatibility seed and offline compiler default, not the live authority once the database row is available. No automatic profile edits or conversational agent-preference extraction were added.

## Context changes

- Retrieval uses the current request rather than concatenating the last five user AND assistant messages. Explicit short follow-ups can inherit a user topic.
- Whole-profile recall remains broad. Topic-specific recall selects matching profile records. Follow-ups such as shared preferences retain the prior user topic, not unsupported assistant claims.
- Personal-only recall skips the five unrelated memory-bank fetches and excludes project state, development records, procedures, reflections, and older-history searches. Explicit mixed/project/capability requests retain their other scopes.
- Small procedure/development/reflection tables no longer bypass relevance checks. Human-profile recall alone no longer enables development-state retrieval.
- Coverage logs distinguish topic-excluded records from records omitted by the token budget. This is still bounded, lexical retrieval, not a general semantic understanding layer.

## Tests and limitations

- Offline suite: 79 test files; agent-profile tests execute the SQL in isolated PostgreSQL/WASM, checking exact seed preservation, rerun safety, revision updates, access restrictions, cache behavior and agent isolation.
- Extended controller tests inject a changed database profile and check that both rendered prompts and preference comparisons use it, not the Alice seed.
- Profile tests cover crowded history, topical/full recall, user-topic follow-ups, unrelated-bank read suppression, and small-table leakage.
- Routing audit: 22/22 with the actual planner and mocked execution. No live notes were changed.
- `node scripts/evaluatePersonality.js --conversation --answer-boundaries` adds eight sequential turns across two scenarios. It carries real generated replies forward and uses production context selection over synthetic, read-only memories. It does not exercise tool execution, the production database, or audio playback.
- Latest inspected live report: `backend/.local/personality-evaluations/1789570282907.json`, 8/8 smoke checks. Routing report: `backend/.local/reliability-audits/1789570312208-boundaries.json`.
- Manual review caught failures that the initial regex checks missed: invented note UI instructions, assistant-versus-user approval confusion, and model-only claims that memory only holds this session. The first two prompted shared explanation-boundary/guide selection and explicit approval ownership; the existing grounded recall boundary handles the third in the application path. Checks were strengthened to flag these failures.
- Do not interpret eight passing turns as general reliability. The model-only path remains weaker on memory capability claims. Next evaluation should broaden ordinary conversation and held-out wording, including longer follow-ups and actual tool-result synthesis, with execution kept isolated.

## Next step

Apply migration 016, verify `source: database`, then use the app to test the prefaced combined preference question, its shared-preference follow-up, a topic switch, and a note explanation. Check context manifests and ownership, not just fluent wording. Keep Qwen 3.5 4B for this next gate; this pass does not establish that a model replacement is needed.
