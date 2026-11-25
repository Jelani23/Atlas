# Condition-claim checks — October 3, 2026

Follow-up: [frozen repeat and encoding experiment](condition-claim-regression-2026-10-03.md). The repeat reproduces the same answer. A generic encoding example plus one branch correction produces valid, correct final responses on guard and finally, five outcomes total; this remains evaluation-only evidence from two exposed cases.

## Scope and implementation

This evaluation-only prototype checks explicit model predictions for source conditions against the existing primitive-expression and branch-selection rules. It adds no JavaScript semantics, interpreter or repository execution. It is not enabled in the production analysis service.

For each supported condition, the initial request supplies only its ID, input binding, expression and source location. The model must predict the condition's boolean value and the branch selected if reached. The independently derived answers stay outside the initial prompt. This differs from the earlier C condition, which supplied expression answers before generation.

The checker rejects stale source/input bindings, omitted claims, duplicate IDs and malformed values. Any condition conflict withholds model interpretation. A remaining conflict after the single allowed correction still withholds it. Matching condition claims do not verify free-text explanations, reachability or whole-function outcomes; those remain separately evaluated. Existing whole-function conflict handling is retained.

These are structured claim checks, not a parser that proves arbitrary natural-language statements. The branch enum distinguishes an actual else block from continuing after an if without else. This distinction can expose vocabulary/structure mistakes without necessarily explaining a wrong return value.

## Experiment

Command: `node backend/scripts/evaluateConditionClaims.js`.

Use the exposed guard-method development case with three inputs. Two installed local profiles are evaluated sequentially: qwen2.5-coder:7b without thinking, 4096 tokens/context 8192; qwen3.5:4b with thinking, 12000 tokens/context 16384. Each allows at most one correction, triggered only by a condition conflict. The two profiles are not a controlled model comparison. No held-out cases are consumed; no model reference output is included in feedback.

Report: `backend/.local/semantic-evaluation/1791040621966-condition-claims.json`. Complete source, initial requests, feedback, final text, completion metadata, independent checks and outcome scores are saved. Native thinking text is not retained. Model-generated reference answers are not used.

The coding model initially gets all boolean condition values right but calls the false paths else instead of fallthrough. It incorrectly predicts string 7 for numeric input 7. Its correction is byte-identical, leaving both branch conflicts and outcome error. Outcome score stays 2/3. Its interpretation is withheld for the branch conflicts; this is successful detection, not improved semantic reasoning.

The general model completes in 122.4 seconds. Its three condition values and selected branches match the analyzer. Manual review finds all three stated outcomes correct, including the escaping TypeError for numeric 7, with supporting explanations. However, it writes bare `TypeError` inside valueJson instead of an encoded JSON string. The strict outcome contract is invalid, so the response remains withheld and receives no automatic outcome pass score. There was no correction attempt: no condition mismatch required one.

| Profile | Conditional claims | Stated outcomes, manual review | Strict outcome contract | Correction |
| --- | --- | --- | --- | --- |
| Coder 7B | Two branch-label conflicts | 2/3 | Valid | Same answer; conflicts remain |
| General 4B with thinking | All three match | 3/3 | Invalid error-name encoding | None |

The checker was then adjusted to report condition validity independently of outcome-format validity. The original report and answers remain unchanged; the adjacent `-review.json` contains the offline recheck, answer hashes and checker hash. No answer was silently repaired. Matching conditions still cannot certify the free-text explanation or the unsupported whole-function result.

## Decision

This is an encouraging general-model example, not a demonstrated reliability improvement. The initial prompt changed, there is only one sample per profile, and the general model's successful semantics did not come from correction feedback. It cannot establish that the checker improved the model. The coder result shows that explicit correction can still be ignored.

Keep this prototype outside production. The next bounded validation should repeat the general-model condition under a frozen policy, then check another already exposed development case with supported conditions. Review semantic and encoding failures separately; do not consume the unused held-out families or weaken the existing contract merely to improve scores. If the semantic improvement repeats, evaluate a less error-prone representation of error names as a separate controlled change.

No live testing is required yet. No paid services, downloads, training, migrations, production memory writes or commits were used. Existing uncommitted work is preserved.

Final verification: **125/125 offline test files passed** after separating condition checks from outcome-contract checks. Log: `backend/.local/semantic-evaluation/offline-tests-condition-claims-final-2026-10-03.log`. The focused tests cover stale bindings, duplicate/missing claims, incorrect branch selection, unsupported conditions, and withholding an invalid outcome even when conditions match. Tracked whitespace checks passed. These results verify the checker, not general model reliability.
