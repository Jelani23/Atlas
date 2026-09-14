# Memory workflow — current handoff

Latest acceptance: the user approved the restored personality in all four app checks. Their real favorite-game correction also logged a successful update to `Minecraft and Celeste`; retrieval of that updated value in a fresh session is still untested. Do not repeat the personality prompts. See the acceptance section in [Alice personality checkpoint](alice-personality-checkpoint-2026-09-14.md). The user is now reviewing the remaining work list; capability/pipeline awareness is the recommended next implementation, alongside unresolved V1 memory/response reliability acceptance. No SQL is pending.

September 14: the approved first personality step is implemented. Alice's unchanged `atlasState.js` now feeds one profile compiler; response settings control layout rather than overriding tone. All 63 offline files pass. Local replies recover her existing tastes/quirks and distinguish them from user preferences, but manual review still found invented missing-memory details and an incorrect SQLite correction. See [Alice personality checkpoint](alice-personality-checkpoint-2026-09-14.md) for scope, evidence and the next short app tone check. Restart/new chat is pending; no SQL is needed. Agent profile storage and self-updates are not implemented. Earlier completion/test instructions below are historical.

Latest app acceptance: both profile questions selected all 27 stable records and recovered favorites; the note-deletion explanation stayed conversational; the impossible conversion was rejected in 812 ms. Capability explanation was still unsupported (claimed note command/API/trash UI), and inspection found a stale capability-context gate after removal of normal semantic preprocessing. The user requests a roadmap/ideas planning break. See the top of memory-tool-checkpoint-2026-09-13.md for accepted tests, remaining semantic limits and the capability/pipeline-awareness requirement. No SQL or repeat of these app checks is pending; this is a checkpoint, not phase completion.

September 13 resumed implementation supersedes the pending tests below: fixed profile-recall recognition and the eight-record context cap, added profile coverage/error handling, blocked common explanation/negation tool hijacks, tightened confirmation parsing and fixed a pending deletion argument shape. Unit conversion now rejects incompatible dimensions and malformed operands; standalone bounded spoken conversions parse correctly. Read-only Supabase inspection confirms all expected favorites exist, and isolated local-model replay supplied all 27 stable profile records. See the top of memory-tool-checkpoint-2026-09-13.md for evidence, limitations and the next app checks. No SQL is required. Passive news and agent profiles remain roadmap work.

Updated 2026-09-12. This supersedes the earlier September 10 checklist. Commit `e697149` is the September 9 foundation; subsequent work remains uncommitted. Preserve the working tree.

## September 13 continuation: memory eligibility and semantic tool inputs

Latest app result: the user confirmed both speech-compatible requests execute and report both results correctly, in 1.701 and 1.728 seconds. They requested a more conversational presentation. The immediate multi-tool response now uses natural sentences with a brief Alice-style introduction; raw tool outputs remain intact internally, failures remain explicit, and no extra model call is added. All 59 offline files pass. Next optional app check is the wording after restart, using either already-successful command. No SQL is needed. See the first section of `memory-tool-checkpoint-2026-09-13.md`.

Latest voice-first clarification: use the punctuation-free app requests now listed in `memory-tool-checkpoint-2026-09-13.md` (spoken numbers with `and then`). Both pass local model/compilation checks. A bounded arithmetic normalizer fixes spoken calculator arguments and rejects unsupported wording instead of stripping it; 58 offline files and 13 local-model cases pass (`1789311571353.json`). Broad STT canonicalization remains planned, with raw-transcript/uncertainty preservation and no assumption that punctuation is present. The semicolon-based app prompts below are superseded.

See `memory-tool-checkpoint-2026-09-13.md`. The user completed the prior app check: memory categories and humor were acceptable, but Alice still pivoted from SQLite to Atlas and falsely called Supabase memory ephemeral. That response failure remains open. The explanation triggered an empty extraction; no new fact was saved in the supplied three turns. Request totals were 3.2, 5.7 and 2.9 seconds.

Fixed reference-only memory eligibility, invalid tool confidence acceptance, mutation-target corroboration, missing tool argument definitions/validation, note filename whitespace canonicalization and a semantic-fallback gate that could drop a recognized multi-tool request. All 57 offline test files pass. Final isolated local-model proposals plus actual compilation pass 11/11 fixed cases (`1789310497688.json`); no tools were executed or production data changed by this evaluator.

Next is a focused app tool check after restart: `Could you total 2 + 2; could you count the words in hello world`, then `Convert 5 kilometers to meters; count the characters in Atlas`. Expect both results for each request (4 and 2; 5000 meters and 5 characters). No SQL or repeat of the already-failing SQLite answer test is needed. Memory comparator accuracy remains 49/61; do not declare this phase complete. The September 12 sections below are historical checkpoints.

## Latest response follow-up: ready for a focused app check

Recovered the earlier "Controlled factual conversation" planning discussion. Casual inference, personal interpretation, brainstorming and creative/social speech should remain possible; factual recall, technical work and actions require more care. No new mode classifier, per-sentence verifier, emergency guarantee or native-heavy-thinking implementation was added.

Updated personality/context instructions to treat the active workspace as background, keep ordinary factual acknowledgments brief, preserve humor and invited speculation, and distinguish recorded decisions from unknown rationales. Memory-bank boundaries are supplied explicitly. Reflection-specific instructions now appear only when reflection context is actually supplied, avoiding an instruction that encouraged inventing a reflection source for project facts.

Validation: all 53 offline test files pass. The expanded local response test covers 12 cases with populated project context and sequential factual paraphrases, plus persistence, missing rationale, speculation and humor. Earlier prompt trials still failed and are retained in local reports; the final run passed all 12 checks (`1789244940503.json`). Review of full answers still found over-explanation and imprecision (e.g. SQLite crash caveats and describing raw-chat recall scope as storage scope). These are limited behavior checks, not a factuality benchmark or proof the broader semantics phase is complete. Canonicalization remains at the previous 49/61 evidence; this change did not alter matching or existing duplicate rows.

Next user step: restart Atlas for the changed response prompt and use a new chat. Check a general SQLite persistence question, the memory-bank distinction, and a dry debugging joke with Atlas still active. These questions exercise response behavior without planting fictional project facts. Share replies and backend logs if behavior drifts or extraction unexpectedly treats a question/joke as a durable fact. No SQL is needed. Existing migration confirmations and cleanup remain complete.

## Latest September 12 continuation: model comparison and ingestion guards

User direction for subsequent response work: preserve context-sensitive reply/thinking styles. Casual conversation should remain the default, with personality, jokes and room for inference/prediction; coding and deep analysis need greater rigor, and emergencies need urgent, carefully checked guidance with honest uncertainty. Do not turn all conversation into strict factual auditing. Keep conversational speculation separate from verified durable memory. See the broader planning section of `project-resume-2026-09-10.md`. The current model-specific thinking-off workaround does not replace the planned deeper reasoning behavior.

See `memory-semantic-checkpoint-2026-09-12.md` for the complete evidence. All 53 offline test files and six isolated conversation smoke tests pass. New guards reject ungrounded replacement evidence and veto common coordinated compound/component merges. The comparison prompt now uses the named claim owner instead of treating generated subject labels as infallible.

The expanded suite has 61 cases: current Qwen 3 4B scored 42/61 (one unsafe equivalent match), installed Qwen 3.5 4B scored 49/61 (none observed, all 11 ownership cases passed). Both factual and disposable replacement PostgreSQL lifecycle tests passed with Qwen 3.5 4B. This remains incomplete semantic accuracy, not a completed phase. The extra assertion check regressed overall results to 41/61 and stays disabled.

The user explicitly requested the full switch to installed `qwen3.5:4b`. Actual `backend/.env`, provider/router defaults and reflection fallback now use it for general replies, search synthesis and memory processing. The separate ingestion override is blank, so these paths share the model. The coding specialist remains `qwen2.5-coder:7b`. Verified effective settings from a fresh process.

Qwen 3.5 exhausted legacy native-thinking budgets in three of five initial response checks. Its native `think:false` mode passed; the reasoning controller now selects that mode specifically for this validated model, including planning, while preserving the prior native-thinking contract for other models. Response filters and recovery remain active. Six final streaming checks passed (`1789243377086.json`), and factual PostgreSQL ingestion passed again using the actual saved settings (`1789243441250.json`). No production test records were written.

The user has now supplied the app smoke test: all three replies completed in about 4.3–5.3 seconds with zero thinking tokens. The explanation question correctly skipped extraction; both SQLite statements produced duplicate decisions and successful working-context merges, with knowledge count staying at 51. However, they matched different existing keys (`database_type` and `database_library`), so this confirms prevention of additional rows, not consolidation of the older duplicate pair.

Response quality remains open: Alice unnecessarily attached generic SQLite facts to Atlas, invented project rationale/current work, and incorrectly described SQLite as limited to the application's lifetime. Normal file-backed SQLite persists across restarts; in-process is not in-memory. It also blurred project memory with separate user-profile/procedural banks. The logged extractions contain the user's correct statements, not these assistant errors. Next focus is response grounding/context relevance alongside remaining semantic classification gaps. No repeat of this app test or SQL is needed now; full tool-planner behavior remains unvalidated.

## Prior continuation: cleanup confirmed, ambiguity handling hardened

September 12: the user confirmed running `removeFictionalLiveTestRows.sql` successfully without prior manual deletions. Subsequent read-only inspection returned no Cedar/Birch matches in either project_memory or knowledge_library. Cleanup is complete; references below to those rows remaining are historical. Restart Atlas and use a new chat to clear cached context. No new migration or additional production fact test is needed yet. Continue local semantic diagnostics; equivalence accuracy and subject ownership remain unresolved.

User preference: **only real Atlas facts or real facts about other topics in the actual app/production database**. Fictional tests must run only in an isolated disposable database. Do not request more live fictional-service statements. Existing Cedar/Birch procedures below are historical evidence, not future test instructions.

The real factual app test produced saved/saved/saved: SQLite paraphrases became knowledge rows 90 and 91. They should have deduplicated. PostgreSQL stayed separate. Alice also repeated the misplaced Cedar project record. Initial read-only inspection confirmed fictional project row 96 and knowledge rows 88/89; these have now been removed by the user and their absence verified.

The user ran `backend/scripts/removeFictionalLiveTestRows.sql` in Supabase successfully. It deletes only project_memory 96 and knowledge_library 88/89 with identity/value/status checks in one transaction; missing/mismatched targets or linked lifecycle records abort it. Actual SQLite/PostgreSQL records are outside its deletion scope. Local PostgreSQL tests verify removal scope, rollback after a later mismatch, verified-row protection, and refusal to cascade-delete verification history. Do not rerun this completed cleanup. Restart Atlas after cleanup; historical conversations/reflections are not erased.

Diagnosis: `factual-diagnostic-1789139446992.json` replayed the SQLite pair three times clean and three times with recorded fictional candidate noise: 2/6 equivalent matches, no candidate retrieval misses. Failure was model interpretation/selection, not database lookup. The model called the paraphrase uncertain or selected index -1 while asserting matching entity/property/scope.

Implemented failure handling:

- Internally inconsistent no-candidate/same-identity comparisons are invalid and get the existing bounded retry. The normal comparison prompt is retained; a trial clarifying sentence was removed after an unhelpful diagnostic run.
- Knowledge comparisons with an identified candidate, same entity/scope, and uncertain property/value agreement or low overall confidence now create a durable review proposal. They cannot refresh, overwrite, or grant trust. Clear high-confidence distinctions and different entity/scope boundaries retain their separate-record behavior.
- Failed/invalid comparison with no exact existing identity defers the knowledge write instead of creating a new row. The original statement stays in conversation history; no automatic retry worker or separate durable unresolved-classification queue was added. Exact-key collisions still use guarded review.
- Evaluation reports track review outcomes separately; a review or invalid output is not counted as a correct distinct result.

Validation: all **48 offline test files passed on the final code**, including cleanup, transport-failure handling, and PostgreSQL integration. The latest 50-case comparator run scored **41/50**, zero unsafe equivalent/update decisions observed, 47 model requests, no invalid outputs or candidate misses (`1789164543905.json`). This is not proof of improved semantic accuracy. Final focused replay `factual-diagnostic-1789164687442.json` still scored **0/6 expected equivalent decisions**: 3 review proposals and 3 invalid comparisons after retry. Invalid comparisons now defer in the real manager; controlled PostgreSQL integration verifies no new row. Confident but wrong distinct decisions and extracted owner labels remain unresolved.

No new migration is required. All 011–014 migrations/tests and fictional-row cleanup are already confirmed. No more app factual tests are needed yet to reproduce the duplicate. Continue semantic work from the saved local diagnostic, not repeated production writes.

## Next user step

The user confirmed migration 013 and its rollback-only SQL test both succeeded on September 11. Migrations 011/012 and their tests were already confirmed. No migration rerun is needed.

Completed in Supabase SQL Editor, separately and in order:

1. `backend/src/database/migrations/013_knowledge_maintenance.sql`.
2. `backend/tests/sql/knowledgeMaintenance.sql`.

013 adds a maintenance audit table and snapshot-checked RPC without changing existing canonical claims. The test uses synthetic rows and rolls back table changes (identity sequences may advance). A subsequent live deployment probe reached the RPC and received its expected invalid-action rejection before record access. Read-only counts: 0 maintenance events, 0 pending reviews, 0 active pending verification attempts older than 30 minutes. No production maintenance was applied. Do not run the full schema against the existing database.

The user confirmed migration 014 and its rollback-only test succeeded, then restarted and ran the Birch test. No migration rerun is needed. That run fixed session merging and project/knowledge routing but did NOT pass correction handling; see the latest result below. Next is a source-backed factual diagnostic in a new chat, not a declaration that canonicalization is complete.

## Latest Birch and factual tests

Birch app logs: saved → duplicate → saved, with successful working-context merges. The last operation should have queued review. Read-only inspection confirmed knowledge rows 88 and 89: SQLite claim under subject sqlite, PostgreSQL replacement under subject postgresql. Both describe birch_demo_service and both remain needs_source. The extractor selected property values as the subjects. The comparator's entity instruction prioritizes SUBJECT, which compounds bad extraction labels. Neither row was changed. Prior Cedar project-memory row 96 also remains.

Alice's responses still unnecessarily offer project-memory saves and mention the unrelated Cedar record. Response guidance is not yet proven effective. The guard against changing an existing canonical row cannot prevent a missed identity from becoming a different row.

At the user's request, added `tests/fixtures/factualMemoryCases.js` with primary-source-backed SQLite in-process and PostgreSQL client/server claims. `npm run memory:validate-lifecycle -- --live --facts` uses local Ollama and isolated PGlite, with registered/active Atlas. It checks actual subjects, action outcomes, entity separation, database reopen, and provisional trust. The synthetic replacement harness now also asserts the owning subject explicitly; earlier successful reports did not assert that dimension at each extraction.

Factual run `1789137885194.json` failed because the SQLite paraphrase inserted another record. A diagnostic replay compared those outputs as equivalent. A second full factual run `1789138008757.json` passed saved/duplicate/saved and reopened two provisional rows. Both results must be retained; one repeat pass does not establish reliability. The harness now records real model responses and continues across factual case failures to expose all results. Product prompts, thresholds, and production records were not changed in this pass.

Next app inputs and sources are in `memory-factual-diagnostic-2026-09-11.md`. Existing synthetic rows under sqlite/postgresql may affect candidate selection in the app; inspect exact claims/IDs rather than assuming an empty store. Do not delete or promote test rows without a specific decision. Subject ownership and correction routing remain open regardless of the factual test outcome.

## September 11 app-test correction

The user supplied full logs for the three cedar_demo_service statements. Eligibility succeeded, but the first and third were mislabeled project memories without project_key and discarded. The second was assigned to active Atlas and saved in project memory. Read-only inspection confirmed project_memory ID 96 (project_key atlas, subject general, key cedar_demo_service_database) contains the SQLite statement; there are no matching knowledge records. Row 96 remains unchanged. This was not successful knowledge ingestion or review.

The initial live harness missed an active, populated project registry. It now includes registered/active Atlas and the exact cedar inputs, plus a positive extraction about Atlas. Project extraction is limited to registered names/aliases mentioned in the input, or an explicit contextual project subject such as "this project" mapped to the active project. Active context alone cannot supply ownership. Bare-pronoun coreference and ambiguous multi-project ownership remain broader semantic work. Project schema alternatives require project_key; knowledge requires subject/domain and a self-contained claim. Each JSON-schema alternative includes its full fields for local constrained decoding. Invalid project outputs from providers ignoring the schema are rejected rather than relabeled with an invented entity.

The exact cedar lifecycle now passes with local qwen3:4b and isolated PostgreSQL: `backend/.local/lifecycle-validations/1789137105478.json`. The earlier active-project run also exposed subject loss on replacement; extraction now explicitly preserves the entity, property, and transition. All 47 offline files passed; the session test passed again after adding failure-confirmation checks. This does not retroactively validate the failed app test.

The logs separately exposed a deployed UUID merge RPC receiving numeric session ID 1276. Migration 014 adds the missing fresh-schema working_context column and distinct `merge_session_working_context_v2(bigint,jsonb)` RPC, preserving the legacy endpoint and existing context. It atomically merges top-level deltas; same-key updates replace, arrays are values. The backend now propagates merge errors and rejects missing confirmation instead of logging successful merge after failure. Fresh/upgrade SQL tests include the legacy UUID endpoint, service_role execution, invalid inputs, missing session, retained keys, idempotent migration, and rollback.

Foreground response guidance now distinguishes acknowledging user-reported information from proving implementation or confirming a completed save. The conversational response still needs an app-level recheck after migration/restart. No existing memories were repaired or deleted during these fixes.

## Implemented locally

- Exact duplicates are selected before other candidates. Removed the version shortcut that skipped property/scope comparison.
- Changed wording at an exact knowledge identity now receives semantic comparison. Equivalent paraphrases preserve canonical wording/trust; changed or uncertain values still require durable review.
- Malformed/schema-invalid comparison responses receive one bounded retry with a shared timeout. Valid uncertainty is not retried. Evaluations count invalid responses separately and cannot score invalid output as a correct distinct decision.
- The regressed second assertion check remains opt-in for synthetic evaluation only. Normal comparison uses the original dimension prompt and unchanged thresholds.
- Migration 013 plus `knowledgeMaintenance.js` and `knowledge:maintain` implement separate preview/save-plan and apply steps. SQL checks full current/review snapshots under row locks and writes before/after audits atomically.
- Recovery explicitly cancels a pending verification attempt unchanged for at least 30 minutes. It increments ownership, marks the record failed, and clears trust. A late worker cannot publish against the old snapshot. This does not prove the worker crashed or automatically retry verification.
- Undo is single-use for an accepted provisional replacement still matching its acceptance snapshot. It restores claim/provenance and clears verification, confidence, and topics. New work blocks undo; the original review audit remains intact.
- The live lifecycle check exposed an eligibility gap for third-person uses/stores statements about unregistered entities. Those statements now reach extraction; question/request openers do not gain the declarative signal. Fallback instructions no longer discourage simple facts, and its schema excludes project memory when no project keys are registered.

## Observed validation

- **47 offline memory test files passed**, including project/procedure regression, project scope, and session-context PostgreSQL checks.
- SQL 011/012/013 assertions passed in isolated PGlite PostgreSQL databases for fresh-schema and upgrade paths. Reapplying 013 passed; fixture table changes rolled back.
- Controlled-model integration covers extraction parsing, semantic routing, real SQL, review acceptance, persisted database reopen, cache reset, recall, undo, stale replay, and provisional trust.
- The real local qwen3:4b lifecycle passed through eligibility, deterministic fallback selection, model extraction/comparison, SQL, review acceptance, database reopen, recall, and undo. Three synthetic statements describe an unregistered service using SQLite, a paraphrase, then PostgreSQL replacing SQLite. Report: `backend/.local/lifecycle-validations/1789134119175.json`. Production memory access is blocked by the harness.
- Earlier comparator evaluation was **40/50** (`1789074828437.json`); the latest continuation above records 41/50 and the still-failing focused SQLite cases.

PGlite runs real PostgreSQL/PLpgSQL, but transport is replaced: this does not test production PostgREST, Electron, the conversation scheduler, or multiple concurrent clients. Database reopen plus cache reset is not a full Atlas restart. One live lifecycle pass is a smoke test, not a general semantic-accuracy guarantee.

## Remaining acceptance and decisions

1. Completed: user applied 013 and its SQL test; deployed PostgREST RPC/count checks passed.
2. 014 and its test are confirmed, and app working-context merges succeeded. Pending: factual diagnostic and correction-identity fix. Track misplaced Cedar row 96 and Birch knowledge rows 88/89. CLI writes happen outside the running backend cache; restart before recall checks. Any real acceptance/recovery/undo needs a specific reviewed plan.
3. Legacy review remains unresolved. Latest read-only audit: 48 total records, 48 flagged, 45 quarantined from trusted retrieval, 3 eligible. Flags are review signals, not deletion instructions. No legacy records were changed.
4. Record 66 decomposition still cannot apply: one clause maps to existing record 75; another has an unstable semantic key. Planner returned `coverage_complete: false`, `apply_eligible: false`, and no approval hash. Do not supersede 66 until all claims have vetted destinations.
5. Semantic follow-up remains: polarity, platform scope, weak aliases, candidate selection, and proposals/requirements/hypotheses versus current behavior. Storage protection does not solve language interpretation or justify broader model overwrite authority.

Recovery creates a separate maintenance event. Historical verification-run audits are not atomically bound to ownership snapshots; an old run may remain pending. No automatic lease/recovery worker is implemented.

Voice/STT, dropped spoken multi-tool actions, and unsupported synthesis remain deferred in `memory-voice-regressions-2026-09-09.md`. Broader ideas in `project-resume-2026-09-10.md` are retained for the user's next planning discussion.

## Reproduction and operator tools

From `backend`:

```powershell
npm run test:memory
npm run test:memory-sql
# Opt-in: synthetic fixtures and local Ollama only
npm run memory:validate-lifecycle -- --live
npm run memory:canonical-eval -- --suite all --live
```

Do not glob-run tests: `memoryAudit.test.js`, `memoryRaceCondition.test.js`, and `memoryExtractor.procedure.test.js` access live services. Use the explicit offline runner.

After 013, previews are read-only. Substitute a specifically reviewed ID/reason and save to a new private file (plans contain record snapshots):

```powershell
npm run knowledge:maintain -- --action recover_verification --record <id> --reason "Why this attempt should be cancelled" --out .local/recovery-plan.json
npm run knowledge:maintain -- --action undo_review --review <id> --reason "Why this acceptance should be undone" --out .local/undo-plan.json
# Separate, explicit application of one reviewed plan:
npm run knowledge:maintain -- --apply .local/undo-plan.json
```

These examples do not authorize production maintenance or blanket cleanup. Changed snapshots are rejected at apply time.
