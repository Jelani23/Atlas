# Branch trace comparison and follow-up source fix

## Shipped change

The shared project-question detector now resolves a valid same-agent, unexpired “that/this file/function/code” reference before scanning incidental spoken names. A follow-up mentioning the normalizer previously selected `src/planner/normalizer.js` instead of the unit-conversion file being discussed. This produced an unrelated file-budget error. Explicit full paths still select a new file; ownership and expiry rules remain intact.

No new response-generation method is enabled. The branch-trace experiment regressed a correct direct answer and is retained only as an audit script.

## Experiment

`backend/scripts/auditBranchExplanations.js` compares direct generation with a compact behavior table followed by explanation. Both variants use the same source-question service, source reader, spoken-name/follow-up detector, configured general model, thinking disabled, total maximum 900 generated tokens and shared 45-second deadline. The trace receives 400 tokens and the final answer 500. Retrieval is isolated/empty; fixed authored oracles run real functions and are withheld from the model. No production writes, generated code execution, global model changes or migrations.

Initial development run: `backend/.local/branch-explanations/1790175813639.json`. Two unbounded trace tables exhausted 400 tokens, and a follow-up selected the wrong file. This run was launched from the repository root and used default environment resolution; it is diagnostic, not the final comparison. A first question also exposed an incidental `calculate` filename collision, so the audit question was rephrased to “evaluate the sum”; general name ambiguity is not solved by this change.

One revision bounded the table to two cases and three steps each, loaded backend environment explicitly, and repaired follow-up binding. Final paired report: `backend/.local/branch-explanations/1790175888243.json`. The same four questions were reused after these mechanical corrections, so they are development probes, not untouched held-out certification. All eight final answers completed.

| Question | Direct | Trace then explanation |
| --- | --- | --- |
| Arithmetic: twenty-one plus two | Correct normalized string `21 + 2`, no evaluation; loose operation-order prose. | Same correct result, minor misleading “joining” wording; one citation points at a non-supporting line. |
| Arithmetic follow-up: trailing “and” versus “and five” | Correct null versus 105 distinction, but omits that public output is the string `"105"`; repeats explanation. | Same type omission and repetition. Trace ends at internal numeric result instead of public string return. |
| Conversion parser: cats to dogs | Correct parser purpose and actual object, but unnecessary hedge and unseen-normalizer assumption. | Shorter correct actual object, still assumes unseen dependency output rather than marking it conditional. |
| Conversion follow-up: normalized `2 + 3` versus `-2.5` | Correct null versus negative-value object; repeats details and conflates regex rejection with finiteness in an extra claim. | **Regression:** invents arithmetic evaluation, returns value 5 instead of null. Trace omits the rejecting guard and propagates the error into final prose. |

Manual decision: reject the trace candidate. Shorter prose and intermediate structure do not establish better analysis. The model can invent behavior inside the trace and repeat it confidently. The direct baseline is also not fully reliable.

## Validation and live check

Targeted project-question and real-conversation tests passed. Added regression coverage for incidental-name follow-ups, explicit path overrides, and correct evidence path through the actual conversation engine. Existing speech separation, ownership/expiry and failure-path coverage passed. No commits.

After backend restart:

1. “How does the unit conversion request file work?”
2. “What does that file do if the normalizer returns two plus three as an expression?”

The second reply should remain about the unit-conversion request file. Its citations should not switch to the planner normalizer. This accepts source selection only, not semantic correctness.

## Implication

Do not add more model passes as a presumed correctness fix. A future bounded experiment should provide mechanically extracted branch/return facts or verified scenarios, with explicit dependency boundaries, and evaluate whether explanations preserve them. This requires a separate implementation decision; it is not enabled here.
