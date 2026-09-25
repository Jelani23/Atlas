# Explanation refinement: rejected instruction-only candidate

## Scope and decision

Tested shared instructions for direct answers, distinct claims, fewer lists, focused follow-ups, concrete examples and careful branch-order reasoning. No file-specific answer templates. The candidate is retained in the audit script only: runtime instructions remain at the user's committed checkpoint because the comparison did not show a reliable improvement.

## Controlled comparison

`backend/scripts/auditExplanationRefinement.js` runs three questions in each of two variants sequentially, with identical configured general model, thinking disabled, 900-token output budget and 45-second deadline. Both variants use the real spoken-name/follow-up detector and source question service, with isolated empty storage. Authored fixed oracles execute the relevant real functions before generation; expected answers are never supplied to the model. No generated code/tests or production data writes.

Report: `backend/.local/explanation-refinement/1790175588503.json`. All six calls completed. This is a small development comparison, not a statistical or broad reliability claim. It does not exercise live speech or the full conversation engine; existing integration tests cover that route separately.

| Fresh question | Original | Refined |
| --- | --- | --- |
| Search evidence overview | Five claims, repeated fallback details and unnecessary export inventory. Mostly captures decision structure, but overstates input requirements and does not explain the heuristic's truth-verification limit. | Three claims and no export inventory, but merges fallback rejection patterns into an unconditional rule and uses dotted names as though they were literal markers. Still does not explain the verification limit. |
| Follow-up: both status markers | Incorrectly predicts true; internally contradicts its acknowledgement that NO_RESULTS is checked first. | Same wrong prediction, now repeated as a separate exact-result claim. Actual result is false. |
| Persistence policy: `" OFF "` versus `"no"` | Correct individual outputs (false, true), but a contradictory opening claims both are disabled. | Same contradiction despite correct individual outputs. |

The overview became shorter; factual accuracy and semantic repetition did not reliably improve. Citation validity does not catch these mistakes. Do not ship this prompt as an accuracy fix or automatically store its answers as verified knowledge.

## Validation and next bounded experiment

Targeted project-question tests and real source-conversation routing tests passed while testing the candidate. Runtime change subsequently removed; the only deliverables are this checkpoint and the reproducible audit. No new migration, configuration, model-default changes or commits. No live acceptance prompts are needed for an unchanged runtime.

A next experiment should separate a compact, structured branch trace from the final explanation, then compare both exact predictions and spoken clarity on fresh examples under the same total budget. Any intermediate trace remains unverified: more model steps do not constitute verification. Keep this experimental until it beats the direct-answer baseline, rather than adding another production prompt or a file-specific correction.
