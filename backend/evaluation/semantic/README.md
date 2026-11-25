# Semantic evaluation

This is an explicit development workflow. It imports no conversation engine, database, learning worker or production memory. No model output is executed. The only executable reference checks are the fixed imports and authored calls in `oracles.js`.

## Case design and review

`cases.json` fixes 24 targets: 12 development cases and 12 held-out cases. Each family belongs to one split. Helpers and callers add supporting functions. The held-out split uses different mechanisms (for example UTF-16 units, finally-return precedence, callback shadowing and stateful regexes), rather than new inputs for the development functions. This is a session holdout, not a claim about model pretraining exposure.

Expected values were authored by source inspection, then cross-checked against fixed executions of 22 inspected pure fixtures. The missing-helper and unknown-cache cases are reviewed as missing information and never executed. This is independence from Alice's answers, not independent human sign-off: the primary development agent authored and reviewed the set. Human review remains desirable before adopting it as a release gate. The offline test repeats all reference checks and builds every real Atlas packet.

Both prompt conditions receive identical complete source and questions. Neither receives expected values, coverage criteria, oracle results or reviews. A uses source plus a concise question; B uses the existing `deepAnalysisContract` messages and provider schema unchanged. Source hashes, actual messages, schemas, model digests, quantization, provider version, settings, token counts, durations and raw final answers are retained. Native thinking is counted but not saved.

## Bounded stages

1. Development screen: guard-method, descending-bound, trim-pipeline; A/B; configured 4B and installed coding 7B. Start with 4,096 shared generation tokens. Exhaustion establishes a budget/completion failure only. Check a narrow case at the existing 12,000-token budget before ruling out capability.
2. Holdout pilot, selected before reviewing its model answers: numeric-whole, exception-boundary, finally-return, short-circuit. Select promising models using development results. Compare A/B, then C where independent checks apply. Keep the other eight held-out families unused for a later milestone.
3. Repeat a small subset with the same seed and settings. This tests repeatability, not a diverse sampling distribution. Do not pool different settings or token budgets into a model score.
4. Expand only when a specific uncertainty justifies the additional calls.

Models must already be installed. The runner refuses unknown model names and limits each command to six cases, three models and two repeats. Calls are sequential; an exclusive lock prevents concurrent runs of this harness. It cannot prevent another application from calling Ollama. Keep Alice idle during evaluations. The lock contains a PID and result path; after a crash, verify the process has ended before removing a stale lock. There is no automatic retry of transport failures. SIGINT checkpoints cancellation. Abrupt termination can leave `running` rows, which are never passes.

The initial presence-penalty-zero diagnostic is a separate policy experiment. The default runner now leaves the model's installed presence penalty intact, matching the deep route's treatment of that setting. Native defaults differ between models and are recorded. Thinking is enabled only for models advertising the capability. Equal generation budgets do not imply equal available final-answer tokens. Context is 16,384; keep-alive is zero to release each evaluation allocation. Load time is recorded and included in wall latency. No global default changes.

The runner now stops a model or condition after two consecutive incomplete/failed calls and records remaining cells as skipped. Earlier artifacts preserve the stop policy used when they ran. Repeated A/B runs reverse condition order on the second repeat; they retain the same seed.

## Commands (repository root)

```powershell
node backend/tests/semanticEvaluation.test.js
node backend/scripts/evaluateSemanticAnalysis.js --label=screen
node backend/scripts/evaluateSemanticAnalysis.js --cases=guard-method --models=qwen3.5:4b --tokens=12000 --label=budget-check
node backend/scripts/evaluateSemanticAnalysis.js --cases=numeric-whole,exception-boundary,finally-return,short-circuit --models=qwen2.5-coder:7b --conditions=A,B --label=heldout
node backend/scripts/evaluateSemanticAnalysis.js --cases=numeric-whole,short-circuit --models=qwen2.5-coder:7b --conditions=C --label=checks
node backend/scripts/summarizeSemanticEvaluation.js REPORT.json REVIEWS.json
node backend/scripts/testMemoryOffline.js
```

Artifacts are saved under `backend/.local/semantic-evaluation`, outside production stores. This directory is gitignored. Reports checkpoint after every response using a temporary file and rename. Keep the report, review and summary together when sharing results. Commands do not resume or retry previous runs automatically.

## Question-focused checked pilot (C)

The host identifies the explicit question, target and invoked caller, retains complete module source, builds existing helper relationships, and uses `primitiveSemantics` plus `functionScenario` for supported primitive inputs. It does not analyze every function. Caller arguments are never silently rebound to callee parameters. Shared state and unlinked callers remain visible in the complete source.

Source snapshots, conditional static expression results, whole-function scenario derivations, analyzer limitations, actual missing dependencies, and model inference remain separate. There are no execution observations in C. An expression result has a typed value, input ID, source span, supporting fact IDs and assumptions. It does not establish reachability. Scenario outcomes are retained only at their existing bounded analyzer status. No JavaScript interpreter has been added.

C adds these checks and requires structured expression assertions alongside the existing answer. Existing `semanticConsistency.checkAssertions` compares their exact typed values. A mismatch or omission allows one correction with the concrete facts and mismatch diagnostics. If it remains, model claims are withheld and the independent evidence is retained. Matching assertions only verifies those assertions: free prose still requires semantic review. An answer that copies checks can still be wrong elsewhere. There is no deployment to Alice's live path pending held-out evidence.

For a reviewed B outcome error supported by a derived whole-function result, pass `--correct-from=REPORT.json --review=REVIEWS.json --conditions=C` with the same model and case. The runner verifies the answer hash and unchanged source, supplies the prior answer plus the specific independent results, and permits one correction call. It refuses cases without a supported mismatching outcome. This mode does not receive authored expected answers or execute fixture code. The summarizer withholds model interpretations when semantic review still finds wrong outcomes or contradictions, preserving host checks separately.

## Review protocol

Read the entire answer, not just its examples. Review only complete answers; retain incomplete responses as completion evidence. Every review names the run ID and SHA-256 of the exact final answer. The summarizer rejects stale or duplicate reviews.

Each review contains:

- `outcomes`: one item per probe, with `id`, normalized `actual`, and a short verbatim `evidence` quote. Use the same typed representation as the expected outcome. A paraphrased expected answer is not evidence. For a missing-information outcome, set `justified: true` only after checking the specific missing fact. A format failure alone is not an incorrect semantic value; normalize unambiguous prose manually.
- `criteria`: one item per authored coverage criterion with `id`, `verdict` (`pass`, `fail`, `omitted`) and response evidence. Correct outputs do not imply correct operation explanations.
- `depth`: a `score` and `rationale`. 0 = no useful answer; 1 = outcomes with little useful reasoning; 2 = decisive operations and relevant assumptions explained; 3 = those plus relevant boundaries, state/caller implications or downstream consequences. Extra length alone earns nothing. Record irrelevant or speculative elaboration in the rationale.
- `contradictions`: concrete conflicts between claims, explanation and examples, including mutually inconsistent branch descriptions. Empty only after checking the whole answer.
- `unjustifiedUncertainty`: requested conclusions incorrectly treated as unknowable. Do not penalize a stated standard-intrinsics assumption as uncertainty.
- `otherSemanticErrors`: false additional claims outside the authored probe criteria, such as asserting integer outputs for arbitrary numeric inputs. Correct supplied examples do not excuse these claims.
- `citations`: review of location validity and whether those lines actually support the claim. B/C location validation is automatic; support is reviewed separately. A citations are reviewed manually.

Exact outcome counts, operation criteria, depth, contradictions, unjustified uncertainty, citation locations/support, completion, latency and repeat consistency are reported separately. There is no combined reliability score or separate automated judge call. Prose ratings are development-agent judgments; objective outcomes are compared with authored, execution-cross-checked references. Pending reviews stay pending. The same agent reviewing results creates possible bias; preserve quotes and full answers so a human reviewer can audit the judgments.

Fine-tuning, global model changes and production integration are deferred. Passing implementation tests establishes harness behavior, not Alice's reasoning reliability.

## Typed whole-function pilot (D)

The earlier C pilot showed why copying correct expression facts is insufficient: a response can copy every fact and still predict the wrong function outcome. D instead requires one typed whole-function outcome per explicit input ID. Its first request contains complete source, the question and the output schema. It receives no derived results or reference outcomes.

`checkedPredictions` binds each existing static scenario to the same source version, function record and exact arguments. Only a `derived` whole-function outcome can contradict a model prediction. A mismatch permits one correction with that specific outcome and its assumptions. A remaining mismatch withholds all model interpretation while retaining the independent outcomes. Matching values never establish the truth of the explanation. Unsupported scenarios remain unverified, not unknowable.

The evaluator separately compares typed outputs with the fixed fixture references after generation. These scores never enter correction feedback. Unknown-runtime answers still require review of whether the stated missing information is justified. The summary keeps automatic outcome counts separate from prose review, and records both correction attempts. Invalid contracts receive no automatic semantic score.

D is a combined source-plus-contract architecture comparison, not an isolated measurement of one prompt sentence. Its shared request builder is also used by the service prototype. The service accepts only existing explicit `with parameter set to value` assignments, requires every parameter, and runs at most two sequential calls within one total timeout. This prototype remains off by default pending evaluation. It never executes repository code.

Next bounded selections, fixed before their D answers are viewed:

1. Development: guard-method and trim-pipeline on the configured 4B; trim-pipeline on the installed coding 7B to test correction of its earlier empty-split error.
2. Regression: finally-return and short-circuit on 4B, compared with the already reviewed B results. These are no longer fresh holdouts.
3. Fresh holdout: utf16, regex-state, caller-truthiness and unknown-runtime, B/D on 4B. The remaining four unused held-out families stay reserved. These cases test unsupported semantics and genuine missing information; they do not establish broad static-check coverage.

The initial static analyzer supports only 8 of the 52 authored probe outcomes. This is a bounded safeguard, not a general verifier.

Use `--conditions=D` to run the pilot. `--context=8192` or `4096` selects a separate per-request resource profile; the default remains 16384. Record and compare those profiles separately. No global model settings change.

The 8B 16k-context screen exceeded ten minutes on one development request. A separate feasibility screen uses `--context=8192 --thinking=off --tokens=4096` on guard-method and descending-bound, A/B. It changes multiple resource settings and must not be pooled with the earlier profile. If promising, evaluate its D development response before choosing it for any held-out comparison. `--thinking=auto` remains the default.

For orderly Windows cancellation, create the report-specific `.stop` path printed by the runner. It aborts the active connection and checkpoints cancellation; unstarted selections do not acquire semantic scores.

September 30 stage decision: both 4B D regressions exhausted 12,000 tokens with no final answer. Do not restart that failing profile in a new command merely to reset the failure counter. The briefly started fresh 4B run was cancelled without an answer after recovering this result. Keep the four preselected fresh families and frozen workflow, but compare B/D using the coding 7B, whose development correction completed successfully. This selection precedes viewing its fresh answers.

The smaller-context 8B screen changed thinking as well as context. One remaining development feasibility check keeps thinking enabled at context 8192: descending-bound A, 12,000 tokens. If it still cannot complete, stop this candidate. This isolates the resource question from the observed loss of correctness with thinking disabled. The coding 7B can also run B/D on the two previously used regression cases to measure correction where host checks actually apply; those are not fresh holdouts.
