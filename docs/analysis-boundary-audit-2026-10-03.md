# Alice code-analysis boundary audit — October 3, 2026

## Scope

The user authorized offline auditing and asked for exact live prompts only if needed. This pass uses the exposed guard-method fixture, complete source, three authored inputs and no expected outcomes in model requests. It starts no application session, production storage, learning or migration. Model calls are sequential under the existing exclusive lock. No downloads, paid services or global configuration changes.

This is a bounded diagnostic on one development function, not a general accuracy estimate. Plain source questions and explicit deep analysis are audited at their service boundary. The desktop, voice input and retrieval from a real saved conversation are not replayed. The ordinary Analyze route with its static scenario renderer is distinct and is not represented by the plain source-question capture.

## Request and configuration findings

`conversationEngine.js` dispatches source questions through `projectQuestion`; explicit deep requests enter `deepAnalysis`. Both inspected services call `getDefaultModel()`. Captured settings on this installation:

| Service | Model | Thinking | Output limit | Context |
| --- | --- | --- | --- | --- |
| Plain source question | qwen3.5:4b | off | 900 | 8192 |
| Deep analysis | qwen3.5:4b | on | 12000 | 16384 |

The separate coding-task router selects qwen2.5-coder:7b for some other code tasks. That does not make it the model used by these early source-question routes. Previous coding-model experiments were controlled workflow evaluations, not identical live configurations. Do not automatically switch production to the coder model; its measured reasoning errors remain.

The audit records installed identities, model metadata, templates, reported model parameters, captured prompts and service options. The coder is Q4_K_M; no reported explicit model parameters appeared in its `show` response. The general model reports presence_penalty 1.5 and sampling defaults; service temperature overrides the reported temperature while unspecified parameters retain provider/model behavior. Captured provider bodies preserve source, messages, schema, thinking mode, context and output budget. No source clipping occurred for this fixture. The templates alone do not establish a broken or correct runtime rendering implementation; no template defect was demonstrated.

## Matched coding-model experiment

Artifact: `backend/.local/semantic-evaluation/1791039528737-boundary-audit.json`; adjacent review binds findings to answer hashes. All eight requests completed. Two repetitions reverse variant order. Common settings: qwen2.5-coder:7b, thinking off, temperature 0, seed 42, context 8192, output limit 4096. No corrections.

| Variant | Manual outcome correctness, each repeat | Contract behavior |
| --- | --- | --- |
| Direct source and question | 2/3 | Plain text; requested citations omitted |
| Typed instructions, no constrained decoding | 2/3 | Markdown fences invalidate strict JSON contract |
| Identical typed instructions with schema decoding | 2/3 | Valid contract |
| Captured deep-service prompt under matched coder settings | 2/3 | Valid service contract and rendered response |

Every variant mishandles numeric 7. The direct answer explicitly recognizes it is truthy, then predicts string 7. The typed variants invent conversion or a bypass for non-string values. The deep-service answer invents returning a non-string unchanged. Repeated answers are byte-identical within each variant. These fixed-seed repeats show repeatability here, not broad stability across seeds or tasks.

The unconstrained/constrained typed pair has identical messages; only provider schema enforcement changes. Removing enforcement does not fix this error. Direct and service conditions change more than one prompt component and are diagnostic, not isolated causal estimates. Manual 2/3 scoring does not turn the invalid JSON response into a releasable result.

Saved service rendering preserves the erroneous model example, with the existing unverified label. It does not create the numeric mistake during formatting. The default deep service has checked-input mode disabled, so no semantic rejection was expected. Its citations validate source locations, not behavior.

## Actual service-policy run

Artifact: `backend/.local/semantic-evaluation/1791039721130-native-service-audit.json`, with adjacent answer-hash-bound review. The plain source question hit its 45-second timeout; no complete model envelope was obtained, so it has no semantic score. One timeout does not establish a universal failure or justify silently extending every timeout.

Deep analysis completed in 84 seconds under its native general-model/thinking policy. It correctly predicted absent for 0 and boat for BOAT, but incorrectly predicted absent for 7 and explicitly asserted that 7 is falsy. Manual outcome score: 2/3. The raw response and final rendered text contain the same error. It additionally claims an argument must be supplied, which the JavaScript signature does not require. The result remains unverified, not independently checked.

The actual policy differs from the matched experiment in model, thinking, budget and model defaults; do not attribute differences to one of those individually. This pass confirms a semantic error exists upstream of rendering on both tested local profiles. It does not prove an intrinsic limit of all local models or quantify error rates across code tasks.

## Decision and remaining scope

No live test is required for the demonstrated failure. The complete source reached the service, removing schema decoding did not repair the coder error, and rendering did not invent the native-model error. Retain the evaluation harness and current production defaults; do not claim a model/template repair without evidence.

The next useful development target is a narrow check of concrete semantic claims (for example, a supplied primitive's truthiness), with source/input identity and reachability limits preserved. This differs from asking for a longer explanation or merely feeding facts into a prompt. Existing tests already show that repeating supplied facts does not establish whole-function correctness. Evaluate any new rejection/checking behavior before integrating it; unsupported claims must remain unverified rather than silently corrected.

Desktop display, speech, ordinary Analyze scenario behavior, and real-session retrieval are not covered by this model experiment. Existing mocked conversation integration tests cover explicit deep routing and cancellation. Request live prompts only if a remaining UI/session discrepancy cannot be reproduced with those offline paths; there is no such discrepancy established by this pass.

## Reproduction commands

- `node backend/scripts/auditAnalysisBoundary.js`: capture source/deep service boundaries, then replay four variants with matched coding-model settings.
- `node backend/scripts/auditNativeAnalysis.js`: run the actual two service policies against the authored fixture and an empty repository substitute. Only model residency is changed to unload after the request.
- `node backend/tests/analysisBoundary.test.js`: network-free source-preservation and service-to-provider mapping assertions; included in the offline suite.

Both audit commands write report-specific `.stop` checkpoints and share the model-evaluation lock. Complete source is supplied as data; no analyzed source or generated test program executes. Review is by the primary development agent, without independent human sign-off.

Verification: **124/124 offline test files passed**, including the new boundary assertions and existing mocked conversation routing/cancellation tests. Log: `backend/.local/semantic-evaluation/offline-tests-boundary-2026-10-03.log`. Tracked whitespace checks passed; no evaluation model remained loaded. Passing these tests verifies software behavior, not model reasoning reliability.
