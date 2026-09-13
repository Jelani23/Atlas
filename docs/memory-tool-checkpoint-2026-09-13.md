# Memory and tool checkpoint — September 13

## Accepted presentation and next acceptance work

The user has now accepted the conversational tool reports. The restart/repeat requests below are historical and complete. No SQL is pending for these changes.

Next priority is route separation: explanation, negation and ordinary conversation must not trigger a tool just because they contain its vocabulary. Use speech-compatible app probes such as `Explain how to rename a variable in JavaScript`, `What does character count mean`, and `I am not asking you to calculate anything explain what a percentage represents`. Each should receive an explanation without a tool action. Exercise destructive or state-changing negative cases with mocked tools locally before any live test.

Then broaden tool correctness and completeness: invalid unit dimensions, omitted/ambiguous arguments, unsupported actions, partial failures, dependent requests and paraphrases. The known converter dimension gap and proposal export mismatch below remain concrete engineering work. Passing 13 fixed local-model planning cases is not coverage of the full tool catalog.

Memory acceptance should cover a real fact or preference stated by the user, paraphrase deduplication, recall in a new chat and after restart, and separation between personal preferences, Atlas facts and general knowledge. Test corrections with an actual change or an isolated fixture, never a fabricated production fact. Check stored identities/review outcomes as well as Alice's wording. The earlier 49/61 comparator result and reproduced response-grounding failure remain unresolved; the 59 passing offline files do not supersede those findings.

## Regular use and passive knowledge roadmap

Begin everyday supervised use now for conversation, brainstorming and low-impact utilities, with implementation-grounded review for coding and important recalled details. This is a staged use recommendation, not a declaration that autonomous actions or factual recall are reliable enough without review. Broader readiness requires route-negative coverage, faithful argument/result handling, cross-session memory round trips, safe correction/scope handling, and honest behavior when tools or evidence fail. Actual use should supply regression examples; completion is determined by these acceptance cases rather than the old informal 80 percent estimate.

The user wants passive world knowledge from trusted news sources, with configurable interests such as NBA, Twitch/streamers and anime. Plan this after the ingestion/retrieval and routing foundation is stable enough to avoid multiplying misclassified or stale memories. Prefer feeds or supported APIs where available; evaluate scraping only where needed. Preserve source URLs, publication/event times, topic relevance and freshness; deduplicate repeated coverage and retain updates/conflicting reports. Collected articles and provisional claims must remain distinct from verified knowledge, rumors, predictions and user/project facts. Source reputation alone must not automatically verify every claim. Offer bounded background collection and optional digests, with topic/source controls and a pause option.

This is a planned feature, not an implemented collector or enabled daily automation. Existing knowledge verification includes source heuristics and temporal checks, but is not a curated news-source registry or complete news trust policy. Preserve casual personality while making sourced recall and uncertainty usable in conversation.

## App success and conversational tool reports

The user confirmed both punctuation-free app requests completed both tools correctly: arithmetic/word count returned 4 and 2 in 1701 ms; conversion/character count returned 5000 meters and 5 characters in 1728 ms. Both took the `multi_tool` fast path with zero context-building time. TTS synthesis started. These logs validate the app's handling of the supplied text; they do not establish microphone transcription quality.

The user requested more natural Alice-style reports instead of `Task 1`/`Task 2` labels. Added `response/toolResultPresenter.js` to the immediate response path. It renders known utility output shapes as conversational sentences, preserves order and all result values, and retains raw tool records for evidence/debugging. Example: `Here you go. 2 + 2 is 4. “hello world” has 2 words.` Conversion output drops only redundant decimal zeros: `Here you go. 5 kilometers comes to 5000 meters. “Atlas” has 5 characters.` Different with/without-space character counts remain explicit. Unknown formats, code and detailed reports stay verbatim.

Partial failures get a partial-completion introduction and retain each error; executor failure detection also recognizes standard `Error reading ...`-style messages. Approval prompts and standalone short-circuit replies are unchanged. Search synthesis continues to use the original evidence path. This presentation adds no model call. It is a small conversational rendering layer, not a new personality-generation model.

All 59 offline test files pass, including presentation tests using actual local utility results, evidence preservation, partial/all failure, exact code preservation and existing routing. The user can restart Atlas and repeat either successful request to review the new wording. No SQL or additional canonicalization fixture test is needed for this presentation change. Memory matching and broader response-grounding limitations below remain open.

## Latest user app result

The memory-bank explanation and dry joke were acceptable. The SQLite answer correctly described normal file persistence, then unnecessarily pivoted to Atlas and falsely called Supabase-backed memories ephemeral/session-bound. Supabase supplies a persistent PostgreSQL database, and Atlas's durable memory tables are not erased on chat closure (https://supabase.com/docs/guides/database/overview). No further response prompt changes were made in this continuation; that grounding/context issue remains open.

Request totals were 3190, 5682 and 2941 ms, all with zero thinking tokens. The first question and joke skipped extraction. The memory explanation unnecessarily triggered extraction because a generic project mention and its registered name together reached score 4; the extractor returned an empty array and no fact was saved. These turns are not tests of equivalence or correction handling, and do not improve the previous 49/61 memory comparator result.

## Implemented

- Project references alone no longer make a turn eligible for memory extraction. An independent memory signal is required. Regression tests cover the exact app explanation, other reference-only messages, real Atlas facts, explicit memory requests and standing instructions. This is a narrow eligibility correction, not a full question/assertion parser.
- Semantic tool proposals require a finite numeric confidence from 0.9 through 1. Previously missing confidence passed the less-than check. Null steps also fail validation cleanly.
- State-changing semantic proposals must match both the independently parsed tool and its arguments. Note filenames normalize whitespace to underscores using the existing execution convention; note content and search queries remain unchanged. Different targets or content still fail. Unresolved `USE_LAST` note targets are rejected on the semantic path.
- Added `src/tools/toolArguments.js`, defining ordered inputs for the known tool catalog and validating count, type, required values, optional inputs, variadic IDs and bounded string/array sizes. The semantic catalog previously supplied null parameter definitions, causing the model to choose correct tools with empty argument arrays. Tools without an explicit contract are excluded from semantic proposals and rejected by validation; coverage tests require contracts for all currently executable registered tools.
- The semantic prompt now explains positional values versus parameter objects. Object-wrapped argument arrays fail validation; they are not silently unwrapped or guessed.
- Semantic fallback now recognizes clauses already identified by the intent resolver even if their first word is absent from trigger prefixes. This fixed the complete request `Convert 5 kilometers to meters; Count the characters in Atlas`, where the first clause lacked a parsed source unit and the second clause's opening word previously prevented recovery.

Deterministic routes, execution permissions, memory verification rules and the model configuration were preserved. Argument contracts apply to semantic plan validation, not every standalone tool call. No migrations, production memory writes, note changes or actual tool operations were performed by the local model evaluator.

## Evidence

All **57 offline test files pass** with network access blocked; the allowlist now includes the three existing tool-planning tests and the new argument-contract test. Tests cover malformed confidence, altered mutation targets, required inputs, numeric types, optional and variadic arguments, note-name normalization, fallback recovery and existing approval preflight. `git diff --check` passes.

`scripts/evaluateToolPlanSemantics.js` calls only local Ollama, blocks database access and replaces tool execute functions with throwing guards. It saves prompts, model options, proposals, selected source snapshots and per-case results. The latest harness also exercises actual segmentation and deterministic-first compilation, reusing the captured proposal if the compiler requests semantic fallback; it never runs the resulting plan.

Reports under `backend/.local/tool-plan-evaluations`:

- `1789246329711.json`: baseline 4/8, with correct tool names but empty required arguments.
- `1789310094482.json`: catalog correction 8/8; this run loaded the compiler before argument validation was added, so it is not final validation evidence.
- `1789310181514.json`: 8/8 with argument validation.
- `1789310313859.json`: expanded 10/11; numeric case returned parameter objects, correctly rejected.
- `1789310377368.json`: positional-value guidance, 11/11 proposal/validation checks.
- `1789310423721.json`: adding actual compilation exposed a fallback-gating failure, 10/11.
- **`1789310497688.json`: final 11/11 including actual compilation**, with correct ordered arguments for arithmetic, word count, conversion, character count, separate search domains and multiword note targets. Incomplete, unsupported and dependent requests did not produce a valid complete plan.

These are small fixed-case checks, not broad statistical accuracy or tool-output correctness benchmarks. The main foreground model and native thinking settings were not changed.

## Next user check and remaining scope

The user clarified that voice will be the main input method. Restart Atlas and test these harmless, speech-compatible requests without punctuation:

1. `Calculate two plus two and then give me the word count of hello world` — both 4 and word count 2 should be returned.
2. `Convert five kilometers to meters and then count the characters in Atlas` — both 5000 meters and character count 5 should be returned.

Follow-up local validation: all 58 offline test files and 13 local model/compilation cases pass (`1789311571353.json`). A bounded arithmetic normalizer now converts common spoken integers/operators to calculator syntax and rejects unsupported wording instead of deleting it. Earlier speech probes (`1789311320045.json`, `1789311361176.json`, `1789311409536.json`) retained a 12/13 failure where arithmetic words were copied unchanged; prompt guidance alone did not resolve it. The normalizer is shared by semantic argument canonicalization and the calculator itself. See `memory-voice-regressions-2026-09-09.md` for supported scope and the broader deferred STT work. No microphone transcription was tested by the local harness.

Ask for replies and backend logs to verify the actual app's routing, execution and delivery of both results. No SQL or fictional project-memory facts are needed. Do not repeat the SQLite conversation test yet; its remaining response issue is already reproduced.

The semantics phase remains open. Memory identity/scope reliability is still 49/61 in the earlier evaluation; existing real SQLite duplicates remain separate, and assertion-mode second-pass comparison remains disabled. Tool argument structure is now stronger, but low-risk argument meaning, broader paraphrases, dependency plans, fallback behavior and tool result correctness still need broader acceptance coverage. Existing code also has a `propose_code_change` schema versus `writeProposal` export-name mismatch, and the unit converter's shared factor table lacks dimensional checks; neither was changed by this continuation. They should be included in subsequent tool correctness work rather than treating the 11-case plan result as proof all tools are correct.
