# Semantic evaluation checkpoint — September 30, 2026

Latest continuation: [October 8 checked-analysis integration and live checklist](checked-analysis-live-check-2026-10-08.md). The actual model repeated a semantic error on complete source, so the new explicit `Checked analyze` command skips model generation unless every requested outcome has a bounded static check. Checked results are preserved; unverified model explanations stay on screen and are not read aloud. All 126 offline test files pass. Normal chat/analysis defaults are unchanged. The next user step is the documented desktop delivery, speech and cancellation test, not another reasoning benchmark.

Latest continuation: [October 6 broader audit and dependency safeguard](condition-claim-broader-2026-10-06.md). Thinking can exhaust its budget without an answer; disabling it introduces semantic regressions. Missing-source clarification failed, so the evaluation adapter now withholds unverified definite predictions when dependency source is unresolved. This is containment, not improved model reasoning. Production remains unchanged.

Latest continuation: [condition-claim regression and encoding experiment](condition-claim-regression-2026-10-03.md). A generic encoding example plus one branch correction produces valid final answers on two exposed cases, five outcomes total. Initial condition conflicts remain, and broader reliability is unproven. Conditional checks, outcome validity and prose quality remain separate. No production rollout or live test is warranted yet.

Latest audit: [October 3 request-boundary audit](analysis-boundary-audit-2026-10-03.md). The same primitive semantic error persists in direct, typed and service prompts; native deep analysis also fails it before rendering. Captured live service policies use the general model, distinct from controlled coder experiments. No live testing currently required.

Latest code-analysis continuation: [October 3 single-input comparison](single-input-evaluation-2026-10-03.md). The approach was implemented and evaluated offline but did not improve correctness; production remains unchanged. Code analysis is the user's priority; Wordle work is deferred.

## Decision

Keep the checked-analysis service prototype **disabled by default**. Its conflict handling works, but the tested model/workflow combinations do not support a broader rollout. Live UI or microphone testing would not resolve the semantic failures already reproduced offline.

The user requires the whole system to remain free. The [paid comparison proposal](semantic-next-model-proposal-2026-09-30.md) is withdrawn. Continue with installed local models, existing hardware and free tools; do not introduce paid APIs, subscriptions, hosting or required purchases. All existing uncommitted work is preserved; there are no commits, downloads, global model changes or production memory writes.

## Free local continuation

The opt-in checked-analysis prototype now retains independently derived whole-function outcomes when the first local response fails, times out, is incomplete, contains channel warnings, or violates the typed contract. It withholds model prose and labels predictions as not checked. It does not infer an outcome where the existing analyzer has none. Spoken failure responses include the supported result under the recorded static assumptions.

Cancellation and changed source snapshots still reject the request. A timed-out provider that ignores cancellation continues holding the sequential-call lock until it settles. Regression checks cover these boundaries as well as unavailable evidence. No semantic rules or interpreter were added, and the production route remains unchanged.

The example configuration now selects Ollama rather than the legacy hosted Qwen adapter. No private configuration was changed. Model routing already uses local Ollama for general work, code tasks and search synthesis.

Verification after this continuation: all **121/121 offline test files passed**, with network access disabled by the test runner. Output is saved in `backend/.local/semantic-evaluation/offline-tests-free-local-2026-09-30.log`. The tracked diff has no whitespace errors. No additional model requests, downloads or paid services were used. This verifies failure handling, not improved model semantics.

The compact-prompt milestone below is complete. Reserve the four unused held-out families until a development improvement is demonstrated. Do not request live UI testing for semantic failures reproducible offline.

### Compact local instructions: completed, not promoted

Added evaluation-only condition E: the same complete source, question, inputs and typed provider schema as D, with a shorter system instruction that omits duplicated schema text and limits explanatory prose. Both use the same checker and at most one concrete correction. Production prompts are unchanged. Tests verify matching evidence/schema and separate scoring; all 121 offline test files passed again (`offline-tests-compact-2026-09-30.log`).

Saved report: `backend/.local/semantic-evaluation/1790796415563-compact-local-development.json`, with adjacent hash-bound review and summary files. Six answers plus two corrections ran sequentially on installed `qwen2.5-coder:7b`, temperature 0, seed 42, context 8192, token budget 4096, thinking off. Cases: guard-method, descending-bound and trim-pipeline, all previously exposed development cases. No held-out cases were consumed.

| Dimension | Existing D | Compact E |
| --- | --- | --- |
| Complete / valid final answers | 3/3 | 3/3 |
| Exact outcomes after bounded correction | 5/7 | 4/7 |
| Explanation criteria met | 4/6 | 4/6 |
| Depth by case (0–3) | 1, 1, 2 | 1, 1, 2 |
| Mean request latency including correction | 15.8 s | 13.5 s |

Both invent conversion of numeric 7 into a string. Both invent loop iterations when the initial value is below the lower bound; E also reverses the returned order for input 5. Both initially mishandle splitting an empty string, then correctly repair that outcome and explanation after concrete feedback (1/2 to 2/2 on trim). Valid citation locations do not support the incorrect semantic claims. Reviews are by the primary development agent, not independent human sign-off.

Decision: do not promote E or spend unused held-out cases on it. This small single-repeat run does not establish latency or consistency gains, and its correctness is worse. Offline tests ran during part of the evaluation, so latency is descriptive rather than a controlled performance result. No training, downloads, paid services or production memory writes occurred.

The user has now supplied the Wordle exchange. See [the Wordle investigation](wordle-capability-checkpoint-2026-09-30.md) for the observed failures, an evaluation-only feedback checker, and three local diagnostic results. Even an explicit constraint ledger did not prevent an invalid candidate. The chat's short history window is a plausible contributor, not a confirmed root cause. No production puzzle-specific fix was enabled.

## Results completed since the previous checkpoint

All artifacts below are in `backend/.local/semantic-evaluation/`, with adjacent reviews and summaries. Scores reflect fixed authored references and primary development-agent prose review; there is no independent human sign-off.

| Model/profile and stage | Existing workflow B | Typed workflow D | Finding |
| --- | --- | --- | --- |
| Coding 7B, four fresh families | 3/7 outcomes; 4/8 operation criteria | 4/7 outcomes; 4/8 criteria | D correctly admits the missing cache input. Unicode and regex-state errors remain. |
| Coding 7B, two previously used regression cases | 3/5 outcomes; 2/4 criteria | 3/5 outcomes; 1/4 criteria | Concrete correction fails on both falsy `&&` inputs. D also omits the pending throw in the finally explanation. |
| 4B, the same two regression cases | Prior B results retained separately | 0/2 completed answers | Both D requests exhaust 12,000 tokens with empty final content. No semantic pass scores. |
| 8B, 8192 context, thinking enabled, development | Source-only loop: 2/2 outcomes | Guard + trim: 4/5 outcomes; 3/4 criteria | Resource feasibility improves, but D still invents numeric string conversion. |

### Fresh comparison details

`1790794297299-coder-fresh-heldout.json`: all eight calls completed with valid contracts. B averaged 16.6 seconds; D averaged 14.3 seconds. Both correctly connected helper output to caller truthiness. Both misunderstood UTF-16 indexing and failed regex state reset. B invented a `missing` cache return despite acknowledging absent runtime data; D correctly used unknown, although its surrounding explanation still oversimplified nullish-result behavior as key membership.

There were no whole-function static derivations for these four families, so **no concrete corrections ran**. The one-outcome gain is evidence about the typed response workflow, not evidence that static checking improved unsupported semantics. B had three internal contradictions; D had none. Reviewed depth scores for both were 1, 1, 3, 1. Citation locations existed, but several cited semantic claims were wrong.

### Supported-check regression details

`1790794701853-coder-checked-regression.json`: B and D both predict the two finally results correctly. B explains suppression of the pending throw; D repeats a return-only explanation. On short-circuiting, both predict undefined for 0 and empty string. D receives the independent results 0 and empty string, then repeats the same answer byte-for-byte. Its whole interpretation is withheld; all three static outcomes remain available. Before/after outcome and prose reviews are saved. D's mean latency including correction is 19.1 seconds, versus B's 13.1 seconds.

This complements the earlier development success: the coding model corrected the whitespace split error after concrete feedback. Correction can help, but this regression shows it is not dependable.

### Resource and completion findings

- `1790702346573-typed-regression.json`: recovered both 4B length failures. A briefly started follow-on (`1790794259272-fresh-heldout-typed.json`) was cancelled without an answer once those failures were recovered; it is unscored.
- `1790794451789-eight-b-thinking-feasibility.json`: the source-only loop request completed correctly in 27.7 seconds at context 8192 with thinking enabled. Some line citations were off by one. This is a separate profile from the earlier 16k-context timeout.
- `1790794555486-eight-b-typed-development.json`: both D calls completed in 50.6 and 25.6 seconds with valid contracts. Numeric 7 was wrongly converted to string. That path is unsupported by the host checker, so no correction ran. The trim outcomes were correct, but one assumption was cut off mid-expression. Neither valid JSON nor a matching subset establishes prose reliability.

## Implementation and verification

The typed checker, input binding and service prototype are described in [the September 29 pilot checkpoint](semantic-checked-pilot-checkpoint-2026-09-29.md). The service remains opt-in through its factory option and is not enabled by the production route.

The evaluation summary now also withholds interpretations when manual review identifies a false operation explanation, even if every requested outcome happens to be correct. A regression test covers this case. Correction-attempt reviews are individually bound to answer hashes. The final full offline suite passed **121/121** test files; output is saved in `backend/.local/semantic-evaluation/offline-tests-2026-09-30.log`. The tracked diff has no whitespace errors. No evaluation process or model allocation remains active.

Four unused held-out families remain reserved: numeric-prefix, map-reinsert, loop-continue and helper-shadow. The static analyzer still covers only 8 of the original 52 probe outcomes. No interpreter or arbitrary source execution has been added.
