# Semantic evaluation checkpoint — September 29, 2026

## Recommendation

Keep `qwen3.5:4b` as an **experimental baseline**, with its installed sampling defaults. Do not switch to `qwen2.5-coder:7b` based on this screen: it was faster but less accurate. Neither model demonstrated sufficient reliability for trusted code analysis.

Do not promote the checked C workflow into Alice's live analysis. It fixed one held-out mechanism, regressed another, and failed to complete a third. Copying independently correct expression assertions did not verify the model's surrounding explanation. Keep independent results authoritative and model interpretations explicitly unverified. Fine-tuning remains deferred.

## Delivered

- A 24-function authored case set: 12 development and 12 heldout, with family separation, 52 requested outcomes, and case-specific reasoning criteria.
- Fifty exact execution observations from fixed authored calls to 22 inspected pure fixtures. Two genuinely missing-information cases are reviewed without execution.
- A sequential, local-only evaluation runner, frozen source/model metadata, full final answers, answer-hashed reviews, separate dimension summaries, bounded correction, and repeatability checks.
- An evaluation-only pilot using the existing primitive expression, function scenario and consistency modules. No interpreter or model-generated tests.
- Offline regressions for the harness, reference values, source parity, expected-answer exclusion, malformed responses, assertion conflicts and review integrity.

The primary development agent authored and reviewed the cases. Exact outcomes were independently cross-checked by execution, but prose ratings are agent judgments; independent human review is still a limitation. Expected answers and review criteria never enter model prompts.

Implementation and reproduction details: [evaluation guide](../backend/evaluation/semantic/README.md), [case review](../backend/evaluation/semantic/CASE_REVIEW.md), [runner](../backend/scripts/evaluateSemanticAnalysis.js), [summarizer](../backend/scripts/summarizeSemanticEvaluation.js).

## Measured results

A = complete relevant source and concise question. B = Atlas's existing source packet view and structured contract. C = B plus a question-focused plan, typed static checks and checked expression assertions. C tests that combined intervention; it does not isolate the effect of each added instruction.

### Native-settings development screen

Both models used temperature 0, seed 42, context 16,384 and a shared 12,000-token thinking/output cap. Native sampling defaults and thinking capabilities differ and are recorded. All requests completed.

| Model | Condition | Exact outcomes | Operation criteria | Mean wall time |
| --- | --- | --- | --- | --- |
| qwen3.5:4b | A | 6/7 | 5/6 | 61.1 s |
| qwen3.5:4b | B | 6/7 | 5/6 | 100.5 s |
| qwen2.5-coder:7b | A | 4/7 | 2/6 | 11.6 s |
| qwen2.5-coder:7b | B | 4/7 | 2/6 | 21.4 s |

The contract did not improve exact correctness in this small screen. The 4B model incorrectly called numeric 7 falsy; the coding model invented a non-string passthrough. The coding model also failed loop entry and empty-string splitting. Valid citation locations did not prevent any of those errors. Additional false preconditions and integer-output claims were recorded separately, even when requested examples were correct.

A preceding 4,096-token, presence-penalty-zero diagnostic exhausted all six 4B responses without final content. That differs from its native presence penalty of 1.5 and is not a native-policy capability score. The six coding-model answers were identical between that diagnostic and the native screen. Latencies include loading and are descriptive; these were not controlled hardware benchmarks.

### Held-out checked pilot: configured 4B model

| Case | B exact outcomes | C exact outcomes | Finding |
| --- | --- | --- | --- |
| Whole-string numeric conversion | 1/3 | No completed answer | C exhausted 12,000 tokens despite supplied correct values. |
| Exception scope | 3/3 | 2/3 | C invented conversion by `7.trim()` while matching all seven conditional assertions. |
| finally precedence | 1/2 | 2/2 | C correctly applied the final return to both paths. |
| Logical AND operand values | 3/3 | 3/3 | Both handled falsy operands and return types correctly. |

B completed 4/4 cases and scored 8/11 outcomes. C completed 3/4 and scored 7/8 **answered** outcomes, leaving three unanswered. Among the same three completed cases, **both scored 7/8 outcomes and 5/6 operation criteria**. Thus the higher answered-only C fraction is not an overall improvement. Mean latency rose from 61.3 to 94.6 seconds when including the incomplete C request.

Useful depth remained mixed: C improved the explanation of finally precedence, retained the AND explanation, and lost the decisive pre-try exception distinction. Its three completed answers matched every structured assertion. That does not verify reachability, whole-function outcomes outside supported scenarios, or prose. Semantic review withheld the conflicting exception interpretation while preserving independent facts. There were no unjustified missing-information requests in these tested cases; the genuine-missing-information cases have not yet received model evaluations, so uncertainty calibration remains unmeasured.

### Consistency and correction

Two same-seed repeat calls on the baseline finally case produced byte-identical answers to each other and the original held-out answer, including the incorrect `finish(true) → 'first'` prediction. Model digest and provider version were unchanged. This is a small repeatability check, not an estimate across varied sampling seeds.

A single targeted correction supplied the independently derived `finish(true) → 'last'` result and the prior wrong answer. It fixed that outcome, but replaced the previously correct `finish(false) → 'last'` answer with an unjustified runtime-state unknown. Its requested evidence was improved analyzer support, although the complete source establishes finally precedence. Exact correctness stayed **1/2**, operation coverage stayed **1/2**, and useful depth fell from 2 to 1. All six expression assertions still matched. Semantic review withheld the model interpretation and retained the independently derived true-case result. There was no second correction attempt.

The completed milestone contains **35 sequential model calls: 28 complete and 7 token-budget failures**, with no observed transport failures. Completion is reported separately from correctness. This count includes the initial policy diagnostic, not just the native-policy comparison.

## Artifacts

All raw reports, reviews and summaries are in `backend/.local/semantic-evaluation` (gitignored, isolated from production stores). Prefixes:

- `1790609225439-development-screen`: initial policy diagnostic.
- `1790609970561-native-development`: matched-budget A/B comparison.
- `1790610605012-heldout-checks`: B/C held-out pilot.
- `1790699970596-consistency`: repeatability check.
- `1790700099776-heldout-correction`: one evidence-specific correction.
- `reference-observations-v2.json`: 50 fixed execution observations, source hashes and Node version.

Each evaluated request retains actual messages/schema, source hash, installed model digest/quantization, native parameters, provider version, generation settings, timing, token counts and final answer. Native thinking is counted but never retained. Reviews normalize exact outcomes with quoted response evidence and bind to answer hashes. Missing/incomplete reviews cannot become passes; structural or semantic conflicts preserve host evidence and withhold model claims.

## Boundaries and next milestone

Only seven of the 24 authored functions have received model evaluations. The held-out slice is four small functions; eight held-out functions remain unused. Results do not establish reliability on larger repositories, caller chains, mutable state or missing dependencies. No statistical significance claim is justified.

The next bounded milestone should test a typed prediction-to-input contract against independently derived **whole-function** outcomes, so a model cannot merely copy expression facts while contradicting them elsewhere. Treat unsupported paths as unverified and retain conditional reachability explicitly. Use development cases first, then the reserved families without tuning to their answers. A frozen three-case A/B screen of the already installed qwen3:8b would be a separate model-capability experiment, not grounds to change the default beforehand. No model download or cloud resource is proposed here.

All pre-existing uncommitted changes remain preserved. No commits, global model changes, migrations, production conversation/knowledge writes, background learning, training, autonomous Alice patches or UI changes were made. The production deep-analysis path was not expanded. No additional manual live Alice test is needed to answer these offline semantic questions.

## Final verification

The network-disabled offline suite passed **120/120 test files**, recorded in `backend/.local/semantic-evaluation/offline-tests-2026-09-29.log`. The final whitespace check passed. New tests also ensure incomplete answers cannot receive semantic pass scores and that a rejected structured assertion cannot be re-released by a later summary. All completed model answers have saved reviews; incomplete answers remain unscored. Every report has a saved summary. No evaluation process or lock remains active.
