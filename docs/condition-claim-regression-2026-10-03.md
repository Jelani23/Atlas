# Condition-claim regression — October 3, 2026

## Frozen repeat and existing regression case

Following the [first condition-claim experiment](condition-claim-checkpoint-2026-10-03.md), run `node backend/scripts/evaluateConditionClaims.js --general-regression` with the same installed qwen3.5:4b digest, thinking enabled, temperature 0, seed 42, 12000 output tokens and 16384 context. Calls are sequential and isolated from production state.

Report: `backend/.local/semantic-evaluation/1791059779950-condition-claims.json`; adjacent `-review.json` binds the review to report and answer hashes. Review is by Codex against supplied source and fixed authored references, with no independent human review.

Only guard-method among the existing development cases has condition facts supported by the current analyzer. The second case is therefore finally-return, an already exposed held-out case, now treated as a regression. No unused held-out family was tested and no new static semantics were introduced.

| Case / attempt | Completion | Strict contract | Condition claims | Outcome accuracy | Time |
| --- | --- | --- | --- | --- | --- |
| Guard repeat | Complete | Invalid error encoding | 3/3 match | Manual 3/3; automatic unscored | 81.5 s |
| Finally initial | Complete | Valid | 1/2 match | 2/2 | 80.8 s |
| Finally correction | Complete | Valid | 2/2 match | 2/2 | 64.3 s |

The guard request, settings, model digest and answer are identical to the previous general-model run. This confirms reproduction under these settings; it is not independent evidence across varied inputs or seeds. The correct escaping TypeError is still encoded incorrectly, so the checker withholds the response. No answer was repaired or counted as an automatic pass.

Finally initially labels the false condition as an else branch despite there being no else block. Feedback supplies the independently derived fallthrough fact and its conditional assumptions. The correction fixes the label and preserves the two correct final returns. Its initial overview also says finally “catches” the exception; its per-input reason correctly describes suppression, and the corrected overview removes the inaccurate terminology. Both attempts cite the decisive finally return at line 5 but omit the initiating return/throw locations. This is a branch-label correction, not evidence of rescuing an incorrect whole-function prediction.

The static whole-function checker covers only the true input here. The fixed authored reference supplies the separately scored expected result for both inputs after generation. Correct conditional facts do not fill that static coverage gap or prove the prose.

## Controlled formatting follow-up

Command: `node backend/scripts/evaluateConditionClaims.js --general-regression --error-encoding-example`.

This adds one generic RangeError encoding example to the system prompt. It changes neither the schema nor the source/input message, model policy, acceptance rules or correction trigger. The example is unrelated to either case's expected outcome. Initial and corrected attempts remain separate; there is no automatic format repair. This tests prompt clarity, not a new error representation.

Report: `backend/.local/semantic-evaluation/1791060100710-condition-claims.json`.

The guard initial answer now passes the strict outcome contract and scores 3/3, but calls both false paths else. Its assumptions also contain the incomplete fragment `!`; the schema accepts this nonempty string, illustrating why contract validity does not certify prose quality. The single correction changes both paths to fallthrough, preserves 3/3 outcomes, and replaces the fragment with meaningful assumptions. Times are 56.0 seconds initially and 49.9 seconds for correction. This recovers a complete checked response on this case, while adding a second model call.

The comparison verifies that both cases retain identical provider schemas, source hashes and user messages; the system prompt only appends the encoding example. Model settings and installed digest are held fixed. No causal conclusion about the branch regression follows from one sample, but the prompt change clearly does not guarantee first-attempt claim consistency.

Finally again initially has one else/fallthrough conflict, with both outcomes correct and a correct override explanation. Correction fixes the branch label without changing outcomes. Times are 69.9 seconds initially and 64.2 seconds for correction. Both answers cite line 5. The adjacent `-review.json` records report/answer hashes, controlled comparison checks, prose and citation review, completion and per-attempt scores.

| Encoding example | Initial outcomes | Initial condition claims | Corrected outcomes | Corrected condition claims | Total model time |
| --- | --- | --- | --- | --- | --- |
| Guard | 3/3, valid contract | 1/3 match | 3/3, valid contract | 3/3 match | 105.9 s |
| Finally | 2/2, valid contract | 1/2 match | 2/2, valid contract | 2/2 match | 134.1 s |

## Decision and boundaries

There is concrete progress: the explicit encoding example removes the observed error-format failure, and a single fact-based correction resolves the remaining branch claims in both examples. All five final predictions are correct under the fixed authored references. This does not show that feedback improved whole-function reasoning: the initial predictions were already correct. Neither initial answer passed all condition checks.

Keep the change opt-in and evaluation-only. These are two already exposed cases at one seed, and the repeat without the example was byte-identical. Free-text explanations remain unverified by the system; a schema-valid assumption fragment appeared in one response. Total latency includes the extra correction call. No speed improvement is claimed from these small local samples.

The next useful experiment is a frozen comparison across additional already exposed code cases, including unsupported conditions, with consistent outcome formatting and separate prose review. It should measure whether explicit intermediate questions help reasoning beyond these examples before adding more rules or promoting the prototype. Preserve the four reserved families for a later decision gate.

No live test is needed to answer that question. Everything in this pass used existing local models and hardware, with no paid service, downloads, production memory writes, source execution beyond fixed authored test fixtures, or commits.

Verification: **125/125 offline test files passed** after the final code changes. Log: `backend/.local/semantic-evaluation/offline-tests-condition-regression-2026-10-03.log`. Added assertions verify the encoding example leaves the schema and source/input message unchanged, and correct conditional claims cannot release a wrong finally outcome. Tracked and edited-file whitespace checks passed. All model calls finished and the evaluation lock was released.
