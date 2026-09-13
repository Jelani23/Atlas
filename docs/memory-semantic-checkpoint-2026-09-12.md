# Memory semantic checkpoint — September 12

The user completed the exact fictional-row cleanup. Read-only Cedar/Birch token queries returned no project or knowledge rows. Production tests must use actual facts; synthetic cases below run only in isolated evaluation or disposable PostgreSQL.

## Changes in this continuation

- Replacement quotes are checked against the incoming text even for an apparent nonmatch. Ungrounded quotes are invalid, receive the bounded retry, and cannot justify a new knowledge row after repeated failure.
- The entity comparison instruction now gives an explicitly named claim owner precedence over an erroneous generated subject label. Short fragments still use their subject for context.
- The conservative compound-claim veto also recognizes common coordinated predicates, so an extra clause such as “and stores ...” cannot disappear through an equivalent refresh onto one component. This is a limited veto, not a complete clause parser.
- `OLLAMA_MODEL_MEMORY` optionally selects an installed Ollama model for fallback extraction, deterministic extraction enrichment, and canonicalization. It is blank by default and never changes the provider singleton. The user subsequently requested the full switch: actual `.env` now selects Qwen 3.5 4B as the shared/general model and leaves the separate memory override blank. Existing fast-model overrides were updated to Qwen 3.5 4B. The coding specialist remains unchanged.
- The assertion-mode experiment remains disabled. Fixed its interaction with the uncertainty review guard: a known mode difference now retains separate scope; malformed secondary output defers classification. This fix does not establish the classifier's general reliability.
- Added 11 frozen ownership cases, including mislabeled distractors ranked ahead of a correct candidate. The expanded comparator suite now has 61 cases. `--model` selects a model only for the evaluation process; unknown CLI flags are rejected.
- Evaluation reports capture source snapshots, fixture content/hashes and effective model/context settings before requests. New runs checkpoint each result to `.progress.jsonl`, preserving partial evidence if interrupted. Network requests in the comparator evaluator are limited to the local Ollama chat endpoint.
- The lifecycle harness no longer mutates a shared model provider while recording calls; each actual call is recorded once with model and duration.

## Evidence

All **53 offline test files passed on the final code**, including the assertion-experiment correction, model routing, reasoning policy, response recovery and thinking filter. `git diff --check` also passed.

| Configuration | Cases passed | Unsafe equivalent/update decisions | Report |
| --- | ---: | ---: | --- |
| Earlier retained Qwen 3 4B baseline | 41/50 | 0 | `1789164543905.json` |
| Discarded claim-first framing experiment | 26/50 | 0 | `1789225768794.json` |
| Discarded question-field experiment | 30/50 | 3 | `1789226192591.json` |
| Qwen 3 8B, old owner instruction, ownership only | 4/11 | 0 | `1789226345215.json` |
| Qwen 3.5 4B, old owner instruction, ownership only | 7/11 | 1 | `1789226445575.json` |
| Qwen 3.5 4B, corrected owner instruction, before compound guard | 10/11 | 1 | `1789226496026.json` |
| Qwen 3.5 4B, corrected owner instruction and compound guard | 49/61 | 0 | `1789226785201.json` |
| Qwen 3.5 4B plus corrected assertion experiment | 41/61 | 0 | `1789227288723.json` |
| Current Qwen 3 4B, corrected owner instruction and compound guard | 42/61 | 1 | `1789227280233.json` |

Reports are under `backend/.local/canonicalization-evaluations`. The Qwen 3.5 old-owner run included one cold-load timeout; its 7/11 is not a clean warm accuracy comparison. Earlier experiments do not all include source snapshots. Their code was removed from normal source; the last discarded question-field variant is archived locally in `.local/comparison-experiment-2026-09-12`.

The 49/61 run passed all 11 ownership cases but only 38 of the original 50 cases. It still misclassified some historical/property scopes, requirements/proposals/hypotheses, and paraphrases. Zero unsafe matches observed in a finite suite is not a general safety guarantee.

The current Qwen 3 4B run passed 36/50 original cases and 6/11 ownership cases, with 13 review proposals. The unsafe outcome was the wrong candidate in `ownership_correct_after_mislabeled`. The 49/61 Qwen 3.5 result is better on this expanded suite, but these are single runs with different error distributions, not a statistical accuracy claim. The last two assertion-experiment cases overlapped the start of the Qwen 3 run; do not use those timings as clean model performance measurements.

The corrected assertion experiment passed all eight assertion cases, but regressed other cases to 41/61 with eight review proposals and 96 model requests. It remains disabled; neither its extra latency nor its overall result justifies enabling it.

With Qwen 3.5 4B, both complete local PostgreSQL lifecycle checks passed:

- Actual SQLite/PostgreSQL facts: saved / duplicate / saved, correct owning subjects, two provisional records after database reopen (`1789226897956.json`).
- Synthetic replacement in a disposable database: correct owner through extraction, paraphrase duplicate, changed engine queued for review, acceptance, reopen and conditional undo (`1789226980758.json`).

Lifecycle reports are under `backend/.local/lifecycle-validations`. These are individual smoke-test passes, not evidence of perfect extraction across arbitrary wording. No production memory records were written by these tests, and a documentation citation in a fixture did not grant runtime verification.

## Full model switch and foreground verification

The user explicitly requested changing to the already installed Qwen 3.5 4B for both replies and memory. The actual `.env` and application defaults are updated. A fresh-process configuration check resolves general, search, shared ingestion and reflection to `qwen3.5:4b`; the coding specialist resolves to `qwen2.5-coder:7b`. General routing now also respects `OLLAMA_MODEL` when no general-specific override exists.

The initial response test with legacy `think:true` settings exhausted its token budget on three of five prompts without a visible answer (`1789243186484.json`). Another answer was rejected by an overly narrow literal session-scope regex; the test now accepts the equivalent “scoped to the current session” wording. Native `think:false` passed all five initial checks (`1789243233582.json`). The controller now selects this native mode for the exact tested model `qwen3.5:4b`, across reasoning tiers, retaining existing budgets, output filters and recovery. Other models retain their previous thinking contract.

The final six-case test passed using normal configured routing and policy, including recent-turn recall, supplied project memory, memory explanation, supplied search/tool evidence, a short instruction and a planning reply (`1789243377086.json`). Warm provider streaming duration ranged from about 0.4 to 2.4 seconds in that run. These are protocol and basic-content smoke checks, not a general factuality benchmark; answers can still add unsupported explanations. The test uses an isolated context and blocks production database access. It does not run the actual tool planner, tools, Electron UI or TTS. Reports are under `backend/.local/conversation-validations`.

Factual memory ingestion passed again with the actual saved configuration and no process-level model override: saved / duplicate / saved, different generated SQLite keys resolved to one canonical record, and two provisional records after reopen (`1789243441250.json`).

Keep the experimental assertion second pass disabled. The user has completed the app smoke test below. The actual model setting has already been changed; no further model approval or SQL step is pending.

No migration is required. Do not declare the semantics phase complete: reliable identity/scope classification remains open even though ingestion protection and local replay coverage improved. After a chosen runtime configuration is enabled and Atlas is restarted, any app-level validation must use only real facts. Existing provisional facts remain unverified, and existing duplicate records were not silently merged or promoted.

## User app smoke test after the switch

The memory explanation and two real SQLite statements completed in 4453, 5292 and 4284 ms, with zero thinking tokens and no empty replies or thinking leakage. The question correctly skipped extraction. Both SQLite statements extracted as knowledge with subject `sqlite`, resolved as duplicates, and merged working context successfully. Knowledge count stayed at 51, with 43 records quarantined and no knowledge items included in the response context.

The first generated key `architecture_type` matched existing `database_type`; the second `process_model` matched existing `database_library`. These are the different keys from the earlier real duplicate pair. This app run therefore establishes no additional inserts, not repair of those existing duplicates or a single shared canonical identity. The isolated clean-database lifecycle remains the evidence for that separate behavior.

Alice's response quality is still inadequate: generic SQLite statements triggered unnecessary Atlas/Supabase comparisons, unsupported project rationale and current-work details, and incorrect claims about filesystem overhead and persistence. Normal SQLite reads/writes disk files and survives application restarts; `:memory:` is a separate mode (https://www.sqlite.org/about.html and https://www.sqlite.org/inmemorydb.html). The memory explanation also grouped user preferences and procedural rules into project memory despite separate Atlas banks. The shown extraction values contain only the user's correct statements, so these logs do not establish that Alice's misinformation was persisted.

No new SQL or repeated manual fact test is needed. Next work should address response grounding and context relevance while keeping the remaining semantic-identity limitations explicit. The six earlier isolated conversation passes were basic-content/protocol checks, not sufficient evidence of factual answer quality with populated project context.

## Response follow-up after conversation-style clarification

Recovered the "Controlled factual conversation" planning task. Its suggested grounded/inference/creative-social distinction complements the user's current casual/deep-analysis/emergency direction. Personal interpretation, brainstorming, technical explanation and actions were also discussed. These remain design context; no literal accuracy percentages or complete new mode router were implemented.

Personality guidance now explicitly permits casual guesses, predictions and dry humor. Context guidance distinguishes background workspace from the subject of a reply, identifies the separate memory banks, and prevents treating a recorded choice as a record of its rationale. Reflection-specific instructions are conditional on actual reflection context. A final reply-focus instruction keeps acknowledgments short while allowing requested explanation, speculation and playfulness. No hardcoded SQLite answer or automatic factual verification was introduced.

The expanded local harness uses populated Atlas/Supabase background while asking general questions, including sequential paraphrases. It also checks unknown project rationale, invited inference and a debugging joke. Its mode selection now uses the same `inferMode` function as normal auto routing. Added forbidden-output checks catch irrelevant project pivots and some specific invented claims; regex checks are incomplete, so full outputs were also reviewed. Future reports include expected/forbidden patterns and temperature as well as complete prompts and replies.

Reports: baseline `1789244709215.json` scored 10/12 with topic leakage; intermediate trials `1789244777511.json` and `1789244833068.json` still failed, including a false SQLite correction. Two overly narrow checks were expanded to accept semantically correct session-scope and joke wording, and negative factual checks were tightened, so these counts are not directly comparable accuracy scores. Final report `1789244940503.json` passed 12/12 focused checks. Review still found imprecision in longer answers: recall scope was described as storage scope, and SQLite crash caveats were overstated. Do not label this a general factuality pass. All 53 offline test files pass with reflection guidance preserved.

Ready for a focused app response check after restart; no SQL, model change, production fixture writes or existing-row merge is required. Canonicalization's remaining identity/scope cases, legacy real duplicates and native heavy-thinking validation remain open. The app test should use real questions and a requested joke, not additional fictional service facts.
