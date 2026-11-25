# Coherent source context after the first live run

The first live run exposed omitted cancellation conditions, incomplete citations and one output-limit failure. This follow-up changes evidence selection and a conservative release check; it does not change the model or increase its output cap. No new live model call was made.

## Changes

Fixed line windows are replaced by complete TypeScript syntax units. Small files remain complete. For larger files, complete functions, methods and statements are ranked using the selected focus and actual graph connection sites. If a large function or try body must be split, the selected unit keeps its entire syntax, and records enclosing function/try locations plus omitted catch/finally locations. This records missing context; it does not establish execution order, reachability, or runtime outcomes.

The context budget still caps serialized packets at 24,000 characters. It now prioritizes the target, one connected test, one document and up to two connected code files, with less repetitive tool metadata. Coverage is narrower across files but more coherent within the selected code. Entire `if (question)` handling and `handleMessage` are supplied for the conversation engine, preserving the deep-only cancellation guard, waiting for previous completion, the catch, and the later empty cancellation reply. The task-manager and transport source fit in full. Large-file coverage remains partial.

Each model claim must now cite at least one supplied text excerpt. Metadata or call IDs alone cause an evidence-only result; raw final output and the failure remain available in the audit. The instruction states this format requirement. This is a source-anchoring check, **not semantic verification**. A false claim citing a real excerpt can still pass. Regression tests explicitly demonstrate that limitation. It cannot independently catch the previous model's omitted `previous.deep` condition.

Replaying the frozen old answers against their **original** IDs finds five of twelve claims without a source-text anchor: four transport claims and one engine claim. Both old summaries would be withheld under this gate. This does not mean those five statements were false; the first review distinguishes source truth from citation support. The old live files were not changed or rebound to new evidence IDs.

The live evaluator now accepts a single case with `--case=task-manager`, `--case=transport`, or `--case=conversation`. The default remains all three. Model failure/reason details are included in fresh and cached console outcomes. New audits retain provider prompt/generated token counts when available, explicit requested generation settings, and the original request even if transport fails. Private thinking is not retained.

## Offline evaluation

`node backend/scripts/auditConnectedContext.js` reproducibly rebuilds packets from the frozen first-live snapshot, checking critical source coverage without executing analyzed code or calling a model. It saves new packets and a hash-bound report beside the first-live archive, preserving the originals.

| Target | New packet characters | Target source characters | Connected test source characters |
| --- | ---: | ---: | ---: |
| Task manager | 20,511 | 6,668 (whole file) | 2,448 |
| Transport | 14,227 | 2,586 (whole file) | 3,507 |
| Conversation engine | 23,293 | 6,314 (selected complete units) | 2,448 |

These figures are for the frozen snapshot, not a new live request. The task-manager packet previously consisted of scattered windows; its source is now complete within a smaller packet. That does not establish that Qwen will finish or explain it accurately.

Focused tests cover exact source spans, nested cancellation guards, complete local catch/cleanup blocks, explicit omitted enclosing handlers, parse-error handling, complete-small-file selection, candidate-only neighbor exclusion, metadata-only citation rejection and the inability of source anchoring to establish semantic truth. Existing scheduler, stale-record and storage tests are also retained. The broader offline suite is run separately; its pre-existing `puzzleHelper` catalog mismatch is outside this change.

## Next live check

After offline validation, test only the previously incomplete case, with the normal ATLAS backend stopped and Ollama serving the installed model:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live --case=task-manager
```

This performs at most one model call, with the unchanged Qwen 3.5 4B / thinking / 4,000 output-token policy. Review completion and explanations separately. The explanation should accurately distinguish queued/started/cancelled work, cooperative `isCancelled` checks and skipped final task events; do not infer that changing a task status forcibly terminates arbitrary work. Intended tests are evidence of intent, not automatically executed proof.

Production background learning stays disabled. A second output-limit stop would favor a smaller, explicitly scoped explanation task over a blanket output-cap increase or global prompting change. Successful completion alone would still require claim-by-claim source review before any integration.
