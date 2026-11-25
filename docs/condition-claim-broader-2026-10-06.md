# Broader local analysis checks — October 6, 2026

## Scope frozen before response review

Continue the [October 3 regression](condition-claim-regression-2026-10-03.md) with four existing development cases: trim-pipeline, descending-bound, caller-normalizes and missing-helper. These exercise ordered string operations, loop limits, caller context and justified uncertainty. Do not use the four reserved families. This is a coverage check, not a controlled before/after comparison or a general reliability score.

Command: `node backend/scripts/evaluateConditionClaims.js --broader-regression --error-encoding-example`.

Use installed qwen3.5:4b, thinking enabled, temperature 0, seed 42, context 16384 and output cap 12000. Calls are sequential, local and isolated from production state. Each case has a 600-second deadline. Stop after two consecutive incomplete initial calls. Expected outcomes are used only after generation. No model-generated tests or arbitrary source execution.

Report: `backend/.local/semantic-evaluation/1791316876233-condition-claims.json`. It saves complete requests, source/input bindings, model digest, implementation hashes, final text, completion and timing. Native thinking text is not retained.

## Audit fix

The condition-claim adapter now has an explicit opt-in path for unsupported conditions. It uses the existing strict typed-outcome request plus the generic error-encoding example, without requesting fictitious condition claims. Inspection reports `not_supported`, never a vacuous `matched`. The default still rejects unsupported cases. Source/input binding checks and invalid-contract withholding remain in force; prose remains unverified.

None of these four cases has a condition supported by the existing checker. Therefore this run does not test whether intermediate condition questions help, and there is no condition-based correction. It tests the local model's source reasoning with consistent output formatting where the analyzer cannot supply those checks. Missing-helper requires separate review of justified uncertainty rather than counting unknown as an automatic correct outcome.

Focused regression assertions cover strict default rejection, identical fallback typed schema, unsupported status, stale input rejection, invalid-contract withholding and no fabricated correction feedback.

The two previously supported requests were regenerated and compared against the October 3 saved requests; both remain byte-identical. This confirms that adding unsupported coverage did not change those prompts.

## Review notes

Trim-pipeline completes in 82.5 seconds with a valid contract and 2/2 outcomes correct. Its explanations identify trimming to empty text, splitting that empty text into one element, and the two elements in the nonempty input. Both fixed explanation criteria pass. Citations point only to the final length return at line 4 rather than the transformation lines 2–3. The supplied inputs are strings, so the string-input assumption is appropriate to this case. Its general split assumption must be read in the context of this function's whitespace regex, not as a statement about every separator. Existing whole-function static checks independently match both outcomes; condition checks remain unsupported.

Descending-bound consumes all 12000 generated tokens and ends with `done_reason: length`, no final text, in 192.1 seconds. It is incomplete and unscored, not an incorrect prediction or a schema failure. No private thinking text is used to recover a result.

Caller-normalizes completes in 59.7 seconds, valid contract, 2/2 correct. Both explanations correctly follow the caller's falsy fallback, String conversion and delegation to width; both fixed criteria pass. Citations include both caller and callee source lines. The static analyzer cannot independently establish these whole-function outcomes.

## Completion comparison, selected after the observed loop failure

Run the same four requests with `--no-thinking` added. Keep the model, seed, temperature, context, output cap and deadline unchanged; only the thinking flag changes. This is a diagnostic follow-up selected after a failure, not a preregistered independent holdout. Check exact request and model digest equality in the saved reports. Do not promote a faster profile unless its explanations, outcomes and justified uncertainty also hold up. No automatic production retry is introduced.

Report: `backend/.local/semantic-evaluation/1791317297903-condition-claims.json`. All four requests and all other requested policy fields match the thinking run; installed model digest matches. Adjacent hash-bound reviews preserve outcome, completion, explanation-criterion, uncertainty and citation judgments separately. Reviews are by Codex, without independent human review.

| Case | Thinking enabled | Thinking disabled |
| --- | --- | --- |
| Trimming | 2/2, valid, 82.5 s | 1/2, valid, 12.0 s |
| Loop bounds | Incomplete, 192.1 s | 2/2, valid, 9.8 s |
| Caller normalization | 2/2, valid, 59.7 s | 0/2, valid, 6.7 s |
| Missing dependency | Unjustified TypeError, invalid contract, 79.3 s | Unjustified NaN, invalid contract, 9.6 s |

The first profile completes three of four calls; only two responses pass the strict contract. Its four automatically scored deterministic outcomes are correct, while two requested outcomes remain unscored due to incompletion. The second profile completes all four calls; three responses pass the strict contract, with 3/6 deterministic outcomes correct. Both fail justified uncertainty. Do not describe the first profile as 100% reliable based on its scored subset.

Without thinking, trimming incorrectly maps the empty string split to an empty array. Caller reasoning assigns length 4 to string 7, ignores the null fallback, and assigns length 3 to string null. Faster completion is therefore not a safe general replacement. The loop succeeds with thinking disabled, but this one case does not establish a general retry policy.

## Targeted missing-source clarification

Both profiles acknowledge the missing helper yet invent an outcome. The thinking response equates missing supplied implementation with an undefined export; the other guesses a nonnumeric result and makes additional coercion errors, including claiming null times 2 is NaN. Both also attach needed evidence to a definite outcome, which the strict contract rejects. The checker catches inconsistency in the response format; it does not independently prove uncertainty.

Add an opt-in system instruction distinguishing omitted source/runtime bindings from evidence of an absent value or module. If the requested outcome depends on the missing evidence, request unknown and a description of the operations supported by the source. The rule names no fixture, expected value or error type. The schema, supplied source, inputs, model and thinking policy remain unchanged. This is a targeted diagnostic on an exposed failing case, not generalization evidence.

Command: `node backend/scripts/evaluateConditionClaims.js --missing-dependency-regression --error-encoding-example --source-boundary-rule`.

Report: `backend/.local/semantic-evaluation/1791317365672-condition-claims.json`.

The clarification fails: after 71.2 seconds the model again invents an absent export and predicts TypeError. It now clears neededEvidence, passing the strict contract while retaining the semantic error. Source/input message, schema, policy and model digest match the earlier missing-helper request. Both explanation criteria fail. Citation locations are valid but cannot establish the claimed absent export. The adjacent review records these comparisons and does not count contract validity as justified uncertainty.

## Conservative dependency release safeguard

Add a release safeguard to the evaluation-only condition adapter. If the packet contains unresolved dependencies and a definite outcome has no independent whole-function check, withhold model interpretation with status `withheld_unverified_dependency`. Record the affected input IDs and unresolved dependency records. Preserve independent outcomes and the raw prediction for audit. Do not rewrite it to unknown, change its score, or claim to have proved it false.

This is intentionally conservative: an unrelated unresolved import could cause an otherwise correct unverified prediction to be withheld. It does not establish whether every unresolved dependency affects a particular input. An unsupported analyzer operation by itself does not trigger the gate. Verified whole-function outcomes remain available; unknown responses remain explicitly unverified and still require uncertainty review. This does not prove arbitrary prose or prevent every possible unsupported claim.

An offline recheck of the saved clarification response confirms the new safeguard withholds it. The original report remains unchanged. Its adjacent review includes the new checker hash, answer hash and post-generation recheck, clearly separated from the original model run.

## Decision

Keep the prototype outside the production workflow. Do not switch Alice globally to thinking disabled, raise the output cap, or promote the failed clarification as a reasoning fix. This pass fixes audit coverage and contains one demonstrated release gap, while exposing completion and uncertainty failures that broader rollout must address.

The next development step should examine unrelated imports and genuinely missing runtime state, then consider a clearly labeled evidence-only presentation for blocked answers. Focused tests already cover checked outcomes and multiple inputs, including preserving a checked result while withholding another unverified prediction. More prompt variations on this one missing-helper fixture would be weak evidence of progress. No live UI test is required to investigate these failures.

All work used existing free local models and hardware. No downloads, paid services, training, production memory writes, commits or reserved-case model calls were used. Existing uncommitted work was preserved.

Verification: **125/125 offline test files passed** with the final implementation. Log: `backend/.local/semantic-evaluation/offline-tests-broader-2026-10-06.log`. An additional mixed-input assertion was added afterward and the focused condition-claim tests passed again. Tracked whitespace checks passed. All nine model calls finished; the exclusive evaluation lock was released. Test results validate the audit and release policy, not general model reliability.
