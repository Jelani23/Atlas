# Reliability foundation audit — September 15, 2026

Latest continuation: [September 16 agent-profile/context architecture checkpoint](agent-profile-context-checkpoint-2026-09-16.md). This adds agent-owned profile storage (migration 016 pending), topic-scoped retrieval and sequential local-model conversation checks. Earlier app gates below remain historical evidence, not the latest deployment instructions.

## Latest: repair after the user's multi-turn app test

The app test accepted SQLite and rejected standard-JSON comments correctly. The TTS answer used the runtime observation correctly. Two acceptance failures remained: the generated missing-event answer blurred stored memory with available context, and the combined game answer attributed Alice's Spelunky/Hollow Knight preferences to the user. The user confirmed those additional games were not their preferences. Logs also showed a 502 on recent-history retrieval. This supersedes the earlier isolated-test gate below.

Implemented repairs:

- `preferenceAnswers` renders recognized combined game/music/artist preference questions from separate sources: relevant preference-key records in the user's loaded profile and Alice's existing `atlasState.preferences.enjoys`. User values are quoted, not supplemented from Alice's tastes, earlier assistant messages, or activity records. It reports unavailable/missing profile context without claiming the database is empty. No personality table, profile data edits or database cleanup was performed. Other phrasings still use normal generation; this is a scoped ownership boundary, not a universal preference parser.
- Event-recall checks no longer treat every nonempty memory bank or prior question as supporting evidence. Recognized event verbs are checked against possible event statements, excluding assistant-only history and question/hypothetical material. Potentially supporting records and structured game-event fields still reach contextual generation. Without support, the reply describes a gap in available context rather than a limitation of durable memory. Matching is conservative and heuristic; structured session recall continues to run first.
- Recent-history read failures now propagate a typed error instead of returning `[]`. The request stops before appending the user message, planning a tool action or generating an answer and returns an explicit retry message. The same successfully loaded snapshot is reused for generation, eliminating the second recent-history read. A successful empty result remains valid. Earlier topic-history failures carry an `unavailable` status through context construction and event recall instead of masquerading as no results. This does not fix the external cause of a 502 or change every other memory store's error behavior.

Validation: **78/78 offline files pass**, including two new files for owner separation and history-read errors. The real conversation-controller regression runs the five-turn sequence without resetting between turns, with 28 synthetic profile rows, unrelated project/reflection material, and an incorrect earlier assistant preference claim. The first two generated replies are stubbed; the repaired recall, TTS and preference paths use the real responders and check both saved replies and speech output. Additional tests cover genuine event evidence, missing profiles, changed Alice preferences, approval-request blocking during history failure, recovered reads, malformed responses and thrown network errors. These fixtures never enter the production database. Affected tests passed again after the final preference-key and history-status checks. Prior live-model scores below were not rerun or represented as fresh end-to-end acceptance.

Next app gate: restart Atlas and retry the missing-game question and combined user/Alice game-preference question after a couple of ordinary turns. Expect a context-scoped recall gap when unsupported, and only the user's stored Minecraft/Celeste preferences in the user's portion. Alice should still list her configured games from `atlasState`. No need to manufacture a 502, test deletion on real notes, run SQL, or repeat the already accepted SQLite/JSON/TTS questions solely for this patch. The broader reliability foundation and comparator backlog remain open.

## Current handoff — September 16

The GPU pause below ended when the user finished CS2. The three-part repair pass is implemented and ready for a small app acceptance check. The reliability foundation as a whole is **not** complete; comparator work remains at 51/61 and broad model factuality is not established by this suite.

### Changes since the evening checkpoint

- Controlled local prompt comparisons reproduced unsupported corrections under the larger prompt. Native thinking exhausted a reply budget and did not resolve the problem. It remains disabled for the validated Qwen 3.5 path.
- Ordinary informational replies now use a concise identity prompt and temperature zero. Social, creative and relevant personality topics keep the fuller profile and existing sampling. Alice's source identity, tastes, quirks and inspiration were not edited. This is context selection, not a new personality profile or a canned SQLite answer.
- Unrelated personal preferences are omitted from impersonal replies. Explicit personal recall, supplied recall-coverage metadata, personal wording, relevant topic matches and recognized follow-ups retain the relevant profile context. Retrieval and stored records are unchanged. This selection is heuristic; it may omit indirectly relevant preferences, so the live recall/tone check still matters.
- Memory and implementation instructions now accompany applicable evidence instead of repeating on every context-free factual statement. Existing source/owner, reflection, uncertainty and failed-search boundaries remain in their applicable paths.
- Recognized memory gaps and operating questions retain the tested grounded responders. The note-deletion explanation now names the user as the approver; explaining it does not execute deletion.
- Evaluations include paraphrases, unrelated-profile context, additional true/false factual controls and a correction following an incorrect assistant reply. The evaluator's `--answer-boundaries` option includes the real inventory and operating responders before isolated generation. It is not a full app/database test. Diagnostic `--think`, `--minimal-prompt`, `--personality-only` and `--temperature` overrides are experiment options, not runtime settings.

### Evidence at handoff

- Offline regression: **76/76 files** after the runtime/context changes. Both affected grounded-answer tests passed again after the final deletion-explanation change.
- Routing: **21/21**, `.local/reliability-audits/1789523312213-boundaries.json`.
- Combined response smoke checks: **19/19**, `.local/personality-evaluations/1789523217190.json`. Full replies were reviewed: the original SQLite statement and paraphrase were accepted, the planted false JSON/Base64 claims rejected, and the incorrect earlier SQLite answer retracted. Own/user preferences remained separate and the joke no longer denied being Alice. Brief explanations and character phrasing can still be improved; these results do not prove general factual accuracy.
- Capability smoke checks: **14/14** pattern checks, `.local/capability-evaluations/1789523256249.json`. Manual review caught reversed approval wording in the note explanation despite its pattern pass. That case was fixed, the check strengthened, and rerun successfully in `.local/capability-evaluations/1789523312327.json`. The other cases needed no further code change.
- Whitespace and evaluator syntax checks pass. No database writes, SQL migrations, frontend merge or environment-setting changes were made in this continuation.

Earlier reports are preserved as diagnostic evidence, including false-positive keyword scores and reverted prompt experiments. They are not the current acceptance result.

### Next step: app acceptance

Restart Atlas and open a new conversation. Ask:

1. `SQLite is an in-process database library.` — acknowledge the correct statement, without inventing a separate-server requirement or Atlas implementation history.
2. `JSON allows comments in its standard syntax, right?` — correct this claim without inventing parser behavior.
3. `Do you remember which game we played together last night?` — use any actual supplied evidence, otherwise describe the recall gap; never claim durable memory resets or invent a shared event.
4. `Is your TTS currently working?` — distinguish enabled configuration from the latest available health observation; do not promise playback merely from configuration.
5. `What games do I like, and what games do you like?` — user's Minecraft/Celeste record versus Alice's own established preferences.

Send the replies and backend logs. No SQL is required. The previous Neuro-sama/inventory app gate already passed and need not be repeated now. After this gate, resume the remaining canonicalization cases; passive learning/source trust and broader voice work remain parked.

## Resumed repair: September 15, evening

Recovered the interrupted three-part repair from `Review project and resume work`. The user's subsequent app check passed favorite-game ownership, checked Neuro-sama recall, and the tool inventory. That earlier app gate need not be repeated yet.

- Finished testing the existing `groundedAnswers` integration. Recognized memory/knowledge operating questions use the implementation contract; recognized TTS status questions use the runtime snapshot, keeping configuration, last observed health, and old development records distinct. These are deliberately narrow responders, not a general capability-answer guarantee.
- Missing-event replies describe only the available context. Fixed the unfinished guard so possible evidence in user profile, project records, session state, or prior user dialogue is not discarded. Such cases continue through contextual generation; broad memory questions with irrelevant retrieved records still need semantic evaluation.
- Added unit and real conversation-controller coverage for saved reply history, speech output, no model/extraction work for recognized read-only answers, runtime changes, and contextual fallthrough when records might contain the requested event.
- The evaluation script now supports `--case=<name fragment>`, `--timeout-ms=<milliseconds>`, and an explicitly labeled `--answer-boundaries` mode. Its default remains isolated model generation. It records transport failures and supports focused reruns; neither mode substitutes for the controller tests or actual app validation.

Validation: **76/76 offline test files** and **21/21 routing audit cases** pass. The routing report is `.local/reliability-audits/1789522191632-boundaries.json`. The final unit-test refinement and evaluator syntax check also passed. No new app test is requested while factual-generation repairs remain open.

### Factual correction remains open

The current prompt still generated a false SQLite correction in `.local/personality-evaluations/1789522054590.json`. A general compatible-description example did not fix it (`1789522102275.json`); that prompt experiment was reverted. No SQLite-specific canned reply was added.

The new Python/JSON controls revealed more errors beyond the initial keyword scores: claiming Python executes line-by-line rather than compiling first, claiming Python's standard JSON module ignores comments, and treating comment-like text inside a JSON string as invalid. The evaluator now rejects those observed forms. Original reports retain their scores; manual review finds all three answers in each run factually flawed. This remains an unresolved model-answer problem, not a passing foundation.

Local model calls initially timed out under GPU contention. The user confirmed CS2 was running and requested time before resuming GPU work. Model evaluations are paused; no unrelated application was stopped, no environment settings changed, and no production database writes were made. Resume with the factual correction work and focused model checks when the user is ready, then the combined personality/capability checks. Comparator work remains at the previous 51/61 baseline.

The separate `Build Mac iOS PWA UI` conversation was read for coordination. Its latest message reports host/activity popup layout changes at `6e9c3a0`, PR #1 open/unmerged, with the tiny transition flash deferred. Those are chat-reported states, not freshly verified remote Git state; no frontend merge or pull was performed.

## Repair continuation: September 15

The user authorized repairs after the baseline audit. The following changes are now in the working tree; the baseline evidence below is preserved separately.

- Explanation routing handles conversational framing such as `I was wondering how to rename...`, `Before doing anything explain how to delete...`, and quoted action-only text. Direct requests remain eligible for action routing. The rule is conservative and does not claim complete understanding of mixed or ambiguous speech.
- Checked-knowledge overview and executable-tool inventory recognize the audited polite paraphrases. `What games do I like` now receives explicit profile-recall coverage. Indirect note explanations also receive the operating guide.
- Planner state uses conversation-scoped async context. Pending actions/plans, search and file pointers cannot transfer to a different conversation. Permission requests have an owner; text approvals and UI responses cannot resolve another conversation's request.
- New/resume/reset/delete/shutdown cancel outgoing pending permissions and invalidate the old scope. Transitions serialize; messages arriving during a switch wait for its destination. Deferred background tasks retain the originating scope even if another request releases them. A closed scope cannot initiate further tool execution or recreate pending actions. A tool that already started is not rolled back by this change; general stream/TTS cancellation is a separate concern.
- Prior approval cannot override a subsequently disabled tool policy.
- The existing personality compiler now distinguishes durable memory from supplied context, and casual delivery from speculative factual claims. Alice's seed tastes, quirks and inspiration were preserved. The operating guide distinguishes provisional storage from trusted retrieval and implemented/configured speech from observed health. The collector is described as implemented and opt-in, with enabled/disabled configuration; it remains disabled locally.

### Validation after repairs

| Check | Result | Scope |
|---|---|---|
| Offline regression suite | 74/74 files | Includes two new tests exercising real permission/planner/executor/lifecycle code with operations and external services mocked |
| Phrasing/planner audit | 21/21 | Report `.local/reliability-audits/1789504462721-boundaries.json` |
| Local capability generation | 12/14 pattern checks | Report `.local/capability-evaluations/1789504463779.json`; review notes below |
| Local personality/answer generation | 10/11 at execution time; manual review finds at least two failures | Report `.local/personality-evaluations/1789504376949.json`; not a clean pass |
| Memory comparator | Unchanged: 51/61 | No comparator code changed or comparator evaluation rerun in this repair continuation |

Full offline suite passed after session/task/executor changes. The two affected boundary/context test files passed again after the final phrasing tweak. Syntax and whitespace checks passed. Tests used no production DB reads/writes or real note mutations. No migration or environment change is required.

The capability evaluator deliberately calls the model with isolated operating context, rather than the complete app router. Its inventory case still denied having a master list and hit the output limit; in the app that recognized input is intercepted by the tested deterministic inventory responder. Its dated-feature case avoided false readiness but omitted the requested explanation of the old planned status. Do not interpret either the evaluator or the deterministic inventory as proof that all capability explanations are reliable.

The model still falsely disputed `SQLite is an in process database library`. It also said memory only holds what was saved in the current session, despite the durable-memory guidance. This second failure slipped past its pattern check; the evaluator now rejects that observed variant as well. Old report scores were not rewritten. The null-access example now named TypeError, but some explanation wording remained imprecise. Character availability remained intact; these results do not establish broad factual accuracy. Adding more prompt rules alone has not closed this issue.

### Next app gate and remaining work

Restart Atlas, open a fresh conversation, and ask:

1. `What games do I like` — expect the real saved Minecraft and Celeste preference.
2. `Which games do you like` — Alice's own established tastes, separate from the user.
3. `Can you tell me who Neuro sama is` — checked AI VTuber/Vedal records, not an invented voice model.
4. `Could you give me a list of your tools` — the human-readable executable inventory.

These are read-only questions about real existing records; no fake data or deletion test is needed. The local mocks cannot prove the current Supabase contents or the full app's retrieval and voice presentation. After that gate, continue factual-answer grounding and missing-recollection boundaries, then unresolved comparator cases. Do not call the reliability foundation or V1 complete. Passive learning/source trust and voice expansion remain parked.

## Initial audit scope and decision

Audit the current dirty working tree before another implementation pass. Reliability and identity remain the top priorities. Passive learning is parked; `backend/.env` was inspected and has `KNOWLEDGE_LEARNING_ENABLED=false`. No production database reads/writes, real tool actions, migrations, or personality changes were performed in this audit. Local Ollama calls used isolated fixtures and ran sequentially.

The foundation is not ready for V1 acceptance. Passing the existing offline suite establishes covered behavior, not general semantic accuracy or model factuality. The next implementation should address explanation-versus-action routing first, followed by factual/memory answer reliability and the remaining comparator failures.

## Evidence

| Audit | Result | Limit |
|---|---|---|
| Existing offline regression runner | 72/72 test files pass | Includes mocks and structural tests; not 72 end-to-end app scenarios |
| New boundary audit | 12/21 expectations pass | Guard coverage plus real planner with tool execution mocked; no external actions |
| Actual Qwen capability responses | Original keyword checks: 13/14 | Manual review finds at least two substantive failures, including one marked as passing |
| Actual Qwen personality/response checks | Original keyword checks: 10/11 | Manual review finds at least three substantive failures; personality access itself is largely retained |
| Actual Qwen memory comparator, all suites | 51/61 | Zero unsafe equivalent/update decisions observed; one run does not establish a safety guarantee |

Ignored local evidence artifacts (preserve originals):

- `backend/.local/reliability-audits/1789503043459-boundaries.json`
- `backend/.local/capability-evaluations/1789502902845.json`
- `backend/.local/personality-evaluations/1789502955262.json`
- `backend/.local/canonicalization-evaluations/1789502985957.json`

The comparator used qwen3.5:4b, made 58 model requests, and had zero transport errors, invalid final outputs, or expected-candidate retrieval misses. Its last documented baseline was 49/61; the current 51/61 is a fresh observation, not proof of a systematic improvement. Ten failures remain: units, weak lexical alias, held-out profile paraphrase, versions in different properties, requirement versus implementation, unit case, proposal versus actual, hypothesis versus actual, past proposal, and choosing the correct SQLite record after a mislabeled distractor.

## Priority 1: explanations must not become actions

The new `backend/scripts/auditReliabilityBoundaries.js` reproduces these paths through the actual resolver and planner with the executor replaced:

- `I was wondering how to rename the note called old plan to new plan` invokes the mocked `renameNote` executor. The rename policy permits execution without approval. This is an action-selection defect; no real file was renamed in this audit.
- `I was wondering how to delete a note` enters the deletion flow and creates a pending action.
- `Before doing anything explain how to delete the note called scratchpad` requests deletion permission despite the instruction to explain first.
- `I am curious how to calculate two plus two` invokes the mocked calculator with an undefined argument (serialized as null in the JSON report).

Existing direct explanation/negation controls pass. Prefix-sensitive recognition leaves indirect spoken wording unprotected. Fix this as a shared routing boundary and test ordinary requests, indirect explanations, quotations, negations and mixed requests together. Do not solve it by requiring one exact command phrase or blocking all polite action requests.

Code inspection also found module-global `pendingAction`, `pendingPlan` and last-file state, with no reset in the interface's new/resume conversation paths. Session ownership of approvals is a separate audit target; cross-session execution was not replayed here.

## Priority 2: factual answers, memory claims and capability truth

Observed generated failures:

- Correct SQLite input was rejected: `That's not quite right. SQLite isn't just a library...`. This repeats an existing response problem.
- When a shared-memory question had no supporting context, Alice said `My memory resets between sessions`. Missing retrieved history is not evidence that persistent memory resets.
- Null-property access was labeled `ReferenceError: Cannot read properties of null`. A direct local JavaScript check confirms the error class is TypeError. The old check only required the word null and incorrectly passed this answer.
- The knowledge-library explanation claimed it only accepts explicitly confirmed information and that unverified searches create no new entries. The implemented ingestion path accepts provisional records; trusted retrieval filters them separately.
- TTS was called ready to synthesize despite an unknown supplied health observation. Configuration, last observation and present availability still blur together.

The capability guide itself contains stale source text: `No passive daily news collector or topic subscription service is implemented.` A bounded collector now exists but is disabled and incomplete. Distinguish implemented, enabled, healthy and planned states when updating capability evidence. Correcting this guide is part of awareness reliability, not permission to resume passive learning.

Additional coverage gaps reproduced without generating replies:

- `Tell me about Neuro sama please` and `Can you tell me who Neuro sama is` miss the checked-record overview guard.
- `Could you give me a list of your tools` and `Tell me what tools you can use` miss the executable inventory responder.
- `What games do I like` misses the broader explicit-profile-recall selector. Incidental retrieval could still retrieve games; this is not proof that the record is lost.

Missing a guard is a coverage finding, not proof of a hallucination on that exact prompt. Do not present narrower success on Neuro-sama as a general truth-verification system.

## Identity assessment

The current profile compiler still supplies Alice's established music/game tastes, water quirk, inspiration and aesthetic, and separates her tastes from the supplied user's Minecraft preference. No character reset is indicated by this audit. Generated embellishments about artists and unsupported shared experiences still need review. Stable identity does not require her to invent personal history.

Agent-scoped database profiles and controlled self-updates remain unimplemented. Preserve the existing profile as the seed if storage changes later. Avoid adding another competing personality prompt to fix factual-answer errors.

## Audit tooling changes

Added `node scripts/auditReliabilityBoundaries.js`: a repeatable, offline audit that saves failures and returns exit code 1 while expectations remain unmet. It is intentionally separate from the green regression runner until those failures are fixed.

Strengthened `evaluatePersonality.js` checks for the observed reset-memory claim, wrong JavaScript error class, unsupported TTS readiness and incorrect provisional-storage claims. This does not change runtime behavior. Existing response reports retain their original scores; they were not silently relabeled or rerun to obtain a better number. Keyword checks still require manual review.

JavaScript syntax checks and `git diff --check` pass. Runtime files were not modified during this audit.

## Next development chunks and acceptance

1. Explanation/action routing and approval session ownership. Use mocked/disposable tools for failure reproduction; do not ask the user to reproduce unintended mutations on real notes.
2. Factual/memory/capability answer reliability, with personality controls in the same regression run. Widen phrase coverage while preserving distinct owners for personal recall, operating guides and public knowledge.
3. Remaining semantic comparison cases, including units, proposals versus implementation and distractor selection. Keep review outcomes distinct from successful matches.
4. Fresh-session recall acceptance using the user's real stored data. The prior `Minecraft and Celeste` correction was logged as saved but still needs a fresh-session app readback.

After relevant fixes, the smallest useful live check is a fresh conversation asking `What are my favorite games`, then `Which games do you like`. Expect the user's saved Minecraft and Celeste preference and Alice's separate established preferences. An additional broad recall plus `Anything else` checks coverage without adding synthetic data. A further new conversation checks persistence rather than short-term echo. Do not ask for another round of the already demonstrated failed technical questions before fixes.

The wider roadmap remains: reliability and identity first; Mac/iOS frontend developed in parallel; then voice, source-trust/knowledge expansion, conversation modes and integrated V1 validation. Sandboxed coding, desktop/device control and Watch features follow the foundation. The separate `Build Mac iOS PWA UI` chat has not been inspected in this audit.
