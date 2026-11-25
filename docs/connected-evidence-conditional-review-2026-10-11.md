# Conditional evidence and claim review

The pilot now extracts direct event calls and status/state assignments with the TypeScript AST. Each observation retains its file hash, source span, enclosing function, lexical branch conditions, prior return/throw checks, earlier await expressions, and try/catch/finally or loop regions. Callback boundaries stop inherited path assumptions. These are syntax observations, not a control-flow proof or a claim that an event actually occurred.

The full inventory is saved with the original evidence. Bounded model packets include selected observations and explicit omission counts, alongside complete source excerpts. Purpose remains model interpretation. Dependency-cruiser still supplies module connections and change-impact evidence.

For TaskManager, the collected source explicitly contains:

| Operation | Context preserved by the extractor |
| --- | --- |
| TASK_COMPLETED emission | `_executeTask` try body; earlier await of workFn; earlier missing-task, RUNNING and CANCELLED return checks |
| TASK_FAILED emission | `_executeTask` catch handler; cancellation return check |
| TASK_CANCELLED emission | `cancelTask`; task must exist and have RUNNING, QUEUED or CREATED status |

These contexts are stored literally. Earlier await expressions may themselves be conditional; the extractor does not claim every earlier statement executed. Exceptions, dynamic calls, aliases and receiver identity remain limitations.

## What the release filter does

Claims expressing selected absence or unconditional-behavior patterns, conflating compiler diagnostics with syntax/runtime failures, or claiming test execution from test source are withheld. Claims naming a collected event must at least name that event in their cited excerpts. A limited guard-omission check withholds behavioral claims naming guarded operations but expressing no condition. Withheld text and reasons remain audit data, separate from retained unverified claims and observed operations.

This is a conservative pattern filter, **not a general contradiction solver**. It can miss paraphrases, incomplete conditions, aliases, causal mistakes and unsupported purpose claims. It can also withhold valid statements. Passing it never changes a claim to verified. Negative-condition prose and explicit uncertainty caveats have regression tests so they are not mistaken for claims that behavior is absent.

## Results

Offline replay of the user's preserved failing run with the final filter withholds 6 of 18 claims, including the false claim that TaskManager emits no completion/failure events, unconditional cancellation, and the supposed syntax errors. Citation IDs stay bound to their original packets.

A fresh local all-file run completed in **44.4 seconds**, using Qwen 3.5 4B with the explicit summary profile. Collector time was 9.4 seconds, worker heap 151 MB, maximum measured event-loop delay 54 ms. Both dependency tools agreed on 857 edges with zero reported disagreements. Tool agreement is not proof of complete runtime connections.

The new task-manager answer acknowledges TASK_COMPLETED and TASK_FAILED and retains RUNNING/QUEUED/CREATED in its cancellation explanation. The initial filter over-withheld some uncertainty caveats; the final rules were regression-tested and replayed against the exact saved answers without another model call. Final retained/withheld counts are:

| File | Retained, still unverified | Withheld |
| --- | ---: | ---: |
| Task manager | 5 | 1 |
| Conversation engine | 4 | 2 |
| Model transport | 6 | 0 |

Remaining issues include simplified falsy-parent and missing-task conditions, vague treatment of type declarations, and unsupported extra citations. The conversation engine's event claim was withheld because its cited excerpt lacks the named events. The task-manager completion/failure sentence was withheld for omitting guards; its actual event operations remain visible in the deterministic inventory. These results do not validate autonomous knowledge promotion.

## Artifacts and checks

- `backend/.local/connected-evidence-test/conditional-claim-review.json`: replay of the old failing answers and new bounded context coverage.
- `backend/.local/connected-evidence-test/conditional-live-2026-10-11/final-review.json`: fresh model answers reviewed with the final filter, alongside observed operations. Original responses and initial review are preserved in that directory.
- `evaluateConnectedEvidence.js` now writes `last-review.json` and reports withheld-claim counts. Future runs automatically rebuild evidence after implementation changes.
- New raw evidence snapshots use lossless gzip with the existing 256 MiB disk quota. Existing snapshots are untouched; readers accept old JSON and new gzip files. This keeps the next test from exhausting the store simply by adding another approximately 50 MB raw snapshot.
- Full network-disabled suite: **130/131 test files passed**; the existing `capabilityContext.test.js` failure remains `Undocumented tool puzzleHelper`. Final focused operations and connected-evidence tests passed after filter revisions. `git diff --check` passed.

No analyzed source or generated tests were executed. No production learning, knowledge writes, chat-default changes, or commits were made. The fresh run used only the local model; no hosted service was involved.
