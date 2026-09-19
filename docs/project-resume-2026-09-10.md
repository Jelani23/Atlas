# Project recovery — September 10, 2026

September 19 development checkpoint: see [analysis patch commit scope and limitations](analysis-patch-checkpoint-2026-09-19.md). Final hardening preserves results on model failure, enforces cancellation/deadlines, avoids partial source-line retention, and verifies analysis-note saves. Commit scope is workflow stability, not solved model reasoning. Nothing staged or committed; no migration.

Latest quality checkpoint: [review usefulness and depth probes](review-quality-2026-09-18.md). Test suggestions now survive rejected defect findings, with schema/citation checks and explicit prediction labels. Live probes still show significant semantic errors in both models. A prompt experiment that improved keyword scores but worsened semantics was reverted; no model promotion. Use manual semantic scoring, not keyword passes, for the next comparison.

September 18 acceptance follow-up: fixed false source reads from explanatory wording, natural `read out` requests, dependent range/next-page requests, and explicit review follow-ups. Added sourceConversationRouting.test.js with real resolver/planner/tools/engine; unlike the older grounded-answer test, its planner is not mocked. See source-inspection-2026-09-17.md for the narrow retest sequence. Source/model quality is not signed off by these deterministic routing checks.

Latest implementation: the bounded source inspection / approved regression checks / finding revision workflow is ready for user acceptance testing. See [source inspection and acceptance batch](source-inspection-2026-09-17.md). 87/87 offline test files and 24/24 routing checks passed, plus a real approved-check subprocess and live coder probes. Model reasoning remains imperfect; candidates are not independently confirmed bugs. No migration or commit. The older “next: source-range reading” note below is superseded.

Latest September 17 checkpoint: [large internal-understanding and analysis audit](internal-understanding-audit-2026-09-17.md), after user commit `27ad58b`. The new audit covers controlled code problems, actual Atlas source, all 37 tool contracts, and general/coder/native-thinking comparisons. It found real reasoning and partial-evidence failures; analysis is not signed off. Added opt-in analysis controls, corrected background analysis's false full-file claim and tiny output budget, and scoped runtime tool context. Ordinary conversation/native-thinking defaults are unchanged. No live DB/note writes, model-generated-code execution or commit occurred. Next: complete source-range reading and an inspect/test/revise workflow, not blanket model switching.

Latest deployment follow-up: migration 016 is now applied and independently verified read-only (`alice`, `database`, revision 1, no degradation). The three current priorities are persona/preferences, tools/internal Atlas code understanding, and memory tables. Source-search truncation and inconsistent cache hashes were repaired and tested; storage questions now receive the agent/user ownership guide. See the updated [architecture checkpoint](agent-profile-context-checkpoint-2026-09-16.md). The older pending-migration instructions below are superseded; no more SQL is needed for 016.

Latest architecture handoff: [agent profiles, scoped context, and sequential conversation tests](agent-profile-context-checkpoint-2026-09-16.md). Agent-owned profile storage is implemented with the existing Alice profile preserved as the migration seed. Topic recall skips unrelated memory banks; generated conversation tests now carry real replies forward. **Migration 016 is pending**: the live read-only check returned `PGRST205`, so runtime currently uses the explicit local fallback. Apply only migration 016, restart, and verify the profile source is `database`. This supersedes the older “no SQL/profile-table migration” statements below.

Latest multi-turn follow-up: [post-app-test ownership and history repairs](reliability-audit-2026-09-15.md). SQLite/JSON/TTS passed in the real app, but missing-event wording and mixed user/Alice preferences did not. Those paths now have source-scoped responders and recent-history failures stop before planning. 78/78 offline test files pass, including the user's multi-turn sequence with synthetic crowded context and read failures. Next: two app readbacks (missing event and combined game preferences) after ordinary conversation; no SQL or profile-table migration. This supersedes the earlier gate below.

Current September 16 handoff: [reliability repair and app acceptance](reliability-audit-2026-09-15.md). The factual/memory/capability repair pass reached its local gate: 76/76 offline files, 21/21 routing checks and 19/19 response checks. Capability checks passed with a separately corrected and retested approval explanation. Next: restart Atlas and run the five read-only conversational checks listed there. The user's prior fresh-session Minecraft/Celeste, Neuro-sama and tool-inventory checks already passed. Remaining canonicalization baseline is 51/61; the broader reliability foundation is still open. Earlier handoffs below are historical.

Latest implementation handoff: [September 14 capability awareness](capability-awareness-checkpoint-2026-09-14.md), on top of personality commit `2dd3c2f`. The runtime guide distinguishes executable tools, configured services, last observed TTS health and dated Supabase dev_state records. No database migration or refresh was performed. App explanation checks are pending; unrelated practical-use issues remain in the checkpoint backlog.

Latest user follow-up: personality app checks accepted; the genuine favorite-game update to `Minecraft and Celeste` logged a successful save. Fresh-session recall of the update is not yet tested. The user now asks to review the remaining list. See [current acceptance](alice-personality-checkpoint-2026-09-14.md); the restart/personality check mentioned below is completed.

Latest September 14 handoff: [Alice personality restoration](alice-personality-checkpoint-2026-09-14.md). The original profile is preserved and now compiled into relevant conversational context without competing response-tone settings. 63 offline test files pass; the next action is the user's app tone check after restart. Factual correction and invented-memory response failures remain open. No migration is pending, and database-backed agent profiles are future work. Personality changes are uncommitted on top of `eb45502`.

## Scope and source of context

Recovered from the Coding task's local saved session, Git state, project documentation, the Atlas ideas and planning task, and the recent messages in the ChatGPT conversation Atlas Access Clarified. Only relevant recent portions of the planning conversations were read; this is not an exhaustive import of all Atlas history.

The app task-history reader returned an older part of Coding, while the local session contains September 9–10 messages and work through September 10 at 15:33 UTC. Recent messages were therefore present on disk. The underlying cause of the app's stale/missing display has not been established; conversation length is not a confirmed diagnosis.

## Project as implemented

Atlas hosts Alice in an Electron desktop shell with a Next.js/React UI and a Node backend. The provider adapter supports local Ollama and other providers. The memory work uses local qwen3:4b for synthetic comparison evaluation. Supabase stores durable memories and lifecycle records.

- `backend/src/interface/atlasInterface.js` manages conversation lifecycle and exposes backend events.
- `backend/src/core/conversationEngine.js` connects context, intent, model responses, and tool planning.
- The memory system separates profile/state, project, knowledge, procedural, development, and reflection data, with cached retrieval and background reflection processing.
- `memoryCanonicalizer.js` selects candidate memories, handles exact duplicates, compares semantic dimensions, and validates allowed relationships.
- `memoryManager.js` and `knowledgeIngestion.js` route knowledge through guarded ingestion. Changed knowledge cannot inherit verification or bypass review merely because a model calls it an update.
- Migrations 011 and 012 supply durable ingestion review and explicit preview/apply resolution. The user confirmed both migrations and SQL assertion tests succeeded; do not ask for them again.
- Verification writes compare ownership snapshots. `backend/src/core/generationCache.js` prevents invalidated reads from repopulating memory caches with stale data.

The root README's status paragraph is older than the current work. Voice/STT/TTS and a first multi-tool planner already exist; their broader semantic and asynchronous redesign remains future work.

## Last user-tested behavior

The September 9 evening tests recovered Magnolia for session 1194 and Willow for 1176, including follow-up answers scoped to each session. Typed knowledge queries returned relevant provisional claims and distinguished them from verified knowledge. Typed calculation plus word count executed both tools.

Spoken variants lost entity names, the spoken calculation request dropped one action, and an unclear input produced unsupported synthesis. These issues were explicitly deferred in `memory-voice-regressions-2026-09-09.md`; successful typed tests did not fix them.

## Current checkpoint and next work

Latest resumed work supersedes the older September 13 status below: profile recall now recognizes the user's phrasings and can supply all 27 stable profile records; the favorites were confirmed in Supabase through read-only inspection. Explanation/negation routing and confirmation handling have focused guards, and unit conversions reject incompatible dimensions while accepting bounded standalone spoken requests. Restart/app acceptance steps are at the top of memory-tool-checkpoint-2026-09-13.md. No SQL is needed. The agent-profile and passive-news ideas remain plans, and broader memory semantics remain open.

Latest September 13 continuation is in `memory-tool-checkpoint-2026-09-13.md`: both speech-compatible multi-tool app tests passed and the user accepted the subsequent conversational reports. All 59 offline files and 13 isolated local-model proposal/compilation cases pass. No SQL or repeat of those completed app tests is pending. Next priorities are route separation, broader tool correctness and cross-session memory acceptance. The user's previous response test still showed a false Supabase persistence claim, and memory canonicalization's earlier 49/61 limitation is unchanged. The checkpoint also records staged everyday use and the requested passive news/topic-learning roadmap; no collector or daily automation is implemented by that plan. Prior restart/response-test instructions below are historical.

September 12 response follow-up: recovered "Controlled factual conversation" (ChatGPT task `6a9c29e5-cb64-83ea-934d-0a899cab609c`). Its planning suggestions distinguished grounded recall, inference, and creative/social speech, including personal interpretation, brainstorming, technical/academic explanation, and actions/system operations. Treat these as design context consistent with the user's current direction, not a completed mode router or numeric accuracy guarantees. Updated reply guidance preserves casual guesses and dry humor while separating project background, recorded reasons, and memory banks. All 53 offline files pass; the final expanded local response run passed 12 focused checks (`1789244940503.json`). The user has already performed the earlier restart/model test; the next requested app check concerns this new response change, not another migration or duplicate model setup. Remaining canonicalization limitations are unchanged; see the current workflow handoff.

Latest September 12 continuation: the user completed fictional-row cleanup, and read-only queries confirmed Cedar/Birch are absent from project/knowledge memory. Live app tests must use real facts only. The user explicitly requested the full move to installed Qwen 3.5 4B; actual shared/general configuration and defaults now use it, with the coding specialist unchanged. Its validated native thinking-off mode avoids the empty-response failures seen with legacy thinking settings. All 53 offline tests and six isolated conversation smoke checks pass, and factual PostgreSQL ingestion passed using the saved configuration. Comparator accuracy remains incomplete: Qwen 3.5 scored 49/61 versus Qwen 3's 42/61. The assertion experiment stays disabled. Next is an Atlas restart and a brief app-level check; no SQL or further model approval is needed. See `memory-semantic-checkpoint-2026-09-12.md` and the top of `memory-workflow-status.md` for evidence and limitations.

Updated September 11: commit `e697149` is the saved September 9 foundation. Subsequent work remains uncommitted. Recovery preserved the version-scope fixes and disabled the regressed assertion experiment on the normal path. Interrupted-verification recovery and conditional undo are now implemented in migration 013, with passing local PostgreSQL tests. The full real-local-model lifecycle also passes. See `memory-workflow-status.md` for current validation, limitations, and exact migration steps.

Continue from here:

1. Completed September 11: user confirmed migration 013 and its rollback-only SQL test; 011/012 were already confirmed. Live PostgREST probe passed with 0 maintenance events, 0 pending reviews, and 0 overdue pending verification attempts. No migration rerun is needed.
2. 014 and its test are now confirmed, and working-context merges succeed in the app. Birch retesting still failed correction handling: two knowledge records (88/89) use the database values as subjects instead of birch_demo_service. Cedar row 96 remains misplaced in project memory. No fixture records were changed. The user requested real factual tests; source-backed local tests failed paraphrase deduplication once and passed once. Continue with `memory-factual-diagnostic-2026-09-11.md`, retaining the unresolved entity/correction failure.
3. Review ambiguous legacy records, including record 66 decomposition, with specific operator decisions. Latest planning still prohibits applying record 66's incomplete decomposition.
4. Keep semantic weaknesses visible: the latest broad suite is 40/50. Invalid-output retries are implemented; understanding proposals, scope, and weak paraphrases still needs work. Preserve guarded writes while scheduling further improvement alongside the next planning discussion.

The previous 75–80% estimate was informal. The remaining acceptance criteria, rather than that percentage or a small fixture score, determine completion.

## Broader planning context to retain

The user wants to finish this phase before discussing and implementing the larger set of ideas. These remain proposals, not implemented features or blanket authorizations:

- September 12 user clarification: Alice should adapt thinking depth and reply style to context. Everyday conversation is the default, with personality, humor, and room for inferences, predictions and exploratory ideas; do not impose citation-heavy or rigid factual auditing on every casual reply. Deep dives should support heavier reasoning for analysis. Coding is a current priority alongside ordinary conversation and needs implementation-grounded answers and appropriate validation. Emergency situations call for concise, urgent, carefully checked guidance and explicit uncertainty; perfect accuracy is an aspiration, not a capability guarantee. Speculation in conversation must remain distinguishable from established facts and must not silently become verified durable memory. Response grounding improvements should prevent misleading claims without suppressing conversational flexibility. The current Qwen 3.5 `think:false` workaround is a model-specific runtime choice, not a decision to abandon deeper reasoning modes; reliably enabling native heavy thinking still needs separate validation.
- Streaming STT, incremental intent confidence, cancellable early preparation, and dependency-aware asynchronous execution. Preserve the architecture principle “prepare, do not commit.” See `architecture/atlas-target-pipeline.md`.
- September 13: voice is expected to become the primary input method. Acceptance tests must include punctuation-free speech, spoken numbers and natural conjunctions. Plan STT canonicalization for uncertain names, number/unit transcription, fillers/self-corrections and multi-action preservation; retain raw input and uncertainty instead of silently guessing consequential targets. Current tool-specific arithmetic normalization is bounded progress, not completion of the STT layer. See `memory-voice-regressions-2026-09-09.md`.
- Cross-device access to a home-hosted Atlas and an isolated development environment where Alice can propose code changes for human review.
- A home overview for completed tasks and attention requests, project/task views, connected-device activity, and notifications. The user does not prioritize a main navigation page exposing Alice's raw memory tables.
- Read-oriented account/service connections for notifications and passive knowledge acquisition, with separate permissions for consequential actions.
- World state distinct from personal user state, including changing scheduled future events. Preserve history when current schedules change.
- Predictions distinct from announced schedules and established facts, with uncertainty, provenance, and later outcome evaluation.
- Evidence assessment for conflicting reports, rumors, and hoaxes.

Recovery itself required no new migration. The subsequent recovery/undo implementation uses 013, now confirmed applied and SQL-tested by the user. No new commit was created and no production memory was changed by the deployment probe.
# Latest handoff: 2026-09-14 factual answers

Continue from [knowledge-foundation-2026-09-14.md](knowledge-foundation-2026-09-14.md). Local fixes and a guarded three-record Neuro repair are ready; user SQL execution and fresh-session acceptance are pending. Supabase was read only. Personality is preserved; the reported tool-list paraphrase and duplicate spoken function names are also fixed. Passive learning remains a proposed bounded pipeline with reviewed source candidates.
# Latest source-reading work

See `source-inspection-2026-09-17.md` for bounded line reads, version-checked continuation, approved regression checks and review limits. Arbitrary generated-test execution and autonomous patching are excluded; never claim a proposed test ran merely because an analysis suggested it.
