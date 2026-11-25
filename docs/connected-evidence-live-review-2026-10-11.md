# First connected-evidence live review

The user ran the isolated `--live` evaluation. The script completed in 126.440 seconds. This means the three jobs finished processing, not that all summaries succeeded or were accurate. Production background learning remains disabled.

Original requests, final text, packets, statuses and timings were preserved byte-for-byte in `backend/.local/connected-evidence-test/live-review-2026-10-11/`, with SHA-256 hashes in `manifest.json`. They reference original snapshot `4271420b24bd29cca68394806c85829b7f94feff7881fd48a22e920dd33757fa`; the full versioned evidence file is retained in the parent store. Reviews below concern that frozen evidence, not later source revisions. Review is by Codex, not an independent human evaluator.

| Target | Model duration | Completion | Interpretation |
| --- | ---: | --- | --- |
| Conversation engine | 40.627 s | stop | Six claims passed the JSON/ID checks; important qualification and citation gaps remain. |
| Task manager | 47.434 s | length | No final text; evidence-only fallback. Unscored explanation, not a false answer or a transport timeout. |
| Envelope transport | 36.887 s | stop | Six claims passed JSON/ID checks; multiple citations do not establish the claims attached to them. |

The task-manager request used the existing 4,000-token generation cap with thinking enabled. `done_reason: length` identifies an output-limit stop; no final answer was saved. The runner did not save token counts or thinking text, so this review does not infer a precise thinking-token count. Raising the cap or changing prompting is not established as a fix.

## Claim review

Separate actual-source consistency from supplied-citation support. A statement can be true of the original complete source while its selected evidence IDs fail to support it.

| Target/claim | Assessment |
| --- | --- |
| Engine 1: imports adapters/planner/reasoning to orchestrate conversation | Named imports are present in e1; broad purpose is plausible interpretation, not proven by imports alone. |
| Engine 2: cancels superseded previous turns or closed sessions | Incomplete condition: e2 cancels the previous task only when `previous.deep` is true. Call records identify sites but do not carry their guards. The claim loses this important distinction. |
| Engine 3: closed-session checks before input handling | Checks before further handling/user-message persistence are visible in e3/e5. This should not be read as occurring before every earlier setup operation. |
| Engine 4: test source is intent, not executed results | Appropriate uncertainty; e14 is tagged unexecuted test source. e0 is target-file metadata and adds no test evidence. |
| Engine 5: documentation emphasizes workflow stability, not solved reasoning | Related documentation supports this general interpretation elsewhere in the packet. Selected e20/e21 establish file identity and a path mention, not that substantive description. |
| Engine 6: sets `turn.deep` and throws on deep cancellation | Visible in e5/e6, but the shown throw is inside a try/catch. The summary omits subsequent cancellation cleanup/empty-return handling and does not explain the full no-late-delivery behavior. |
| Transport 1: exports `requestEnvelope` | True in the complete source. Cited e0 has an empty compiler export list and cannot establish the export. This also exposes an analyzer coverage/labeling gap. |
| Transport 2: integer timeout in 1–600000 | Supported by e1's explicit guard. |
| Transport 3: error/aborted/data response handlers | True in the complete source. Cited e14/e20 show error/data only; another supplied excerpt contains the aborted handler. Citations are incomplete. |
| Transport 4: timeout timer rejects the promise | True in the complete source, but cited e7 is a `clearTimeout` call. It does not establish the `setTimeout` callback or rejection. |
| Transport 5: tests define scenarios but were not executed | Appropriate distinction, supported by test-source class and packet coverage. |
| Transport 6: provider uses the transport when `options.timeoutMs` is defined | True in original provider source. Cited e40 establishes module resolution only, not the surrounding condition. |

Both completed responses acknowledge missing runtime evidence and partial scope. That is useful uncertainty retention, but it does not repair omitted guards or incorrect citations. The transport summary also leaves out useful operational details such as the local HTTP request, signal propagation, bounded response size, JSON completion and cleanup. Some relevant source was excluded by the packet builder. The engine packet did not include the complete final cancellation path. No aggregate “accuracy percentage” is justified from these selected, non-independent claims.

The 51 ms maximum event-loop delay is a standalone process observation. The normal backend was meant to be stopped; this does not measure live conversation contention or prove the integrated scheduler yields correctly.

## Offline corrections after preserving the run

1. Include complete small files when they fit the per-file evidence budget. The transport's complete source fits; chopping it into scattered windows unnecessarily omitted useful context.
2. Do not select related files solely from an uncertain shared event key. The task-manager packet had admitted the pilot's own test file through a same-key candidate on a different emitter. Such candidates remain in the raw graph, but no longer displace resolved imports/tests in context selection.
3. Label compiler export lists as a non-exhaustive subset. An empty list must not be presented as evidence of no exports. Complete source now supplies the transport's actual export assignment.
4. Include the model failure and completion reason in console outcomes for evidence-only results, so an output-limit stop is visible without opening stored JSON.

The system instruction, model, generation parameters and live responses were not changed. No new model call was made. The focused regression suite passes, including full-small-file inclusion and exclusion of candidate-only event neighbors. An offline rebuild of the original packets is saved beside the archive as `*.repacked.json`, with sizes, selected paths and a context-implementation hash in `context-review.json`. This measures evidence packaging only, not improved model accuracy.

## Decision

Do not promote this workflow into production learning. Two structurally valid summaries are not two verified explanations, and the task-manager response did not complete. Further work should prioritize bounded coherent function/condition context and explicit citation support review, using this frozen run as a baseline. Do not automatically retry the failed call or claim that the packaging corrections solve the model failures. No immediate repeat of the same live command is needed.
