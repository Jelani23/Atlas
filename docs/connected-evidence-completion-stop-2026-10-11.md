# Stop context-shrinking trials after the function-only failure

The user ran `--live --case=task-cancellation`. The saved result contains the complete 11-line `cancelTask` method and compiler-linked source nodes in a 4,762-character packet. Ollama reported **1,790 prompt tokens, 4,000 generated tokens, 47.685 seconds and `done_reason: length`**, with an empty final content field. The whole script took 48.356 seconds. No explanation exists to score for accuracy or citation support.

The run was copied byte-for-byte into `backend/.local/connected-evidence-test/task-cancellation-limit-2026-10-11/`, with hashes in `manifest.json`. The record SHA-256 is `deeb9bdc9c61c114840aad6b0ec2937b13b1274e48405e7e36b804429470759a`. Its source snapshot is `d372acf79c594881ac5f0d000e41fd0575b3231be88ab507f76b806a46f091b2`. No fresh generation was requested during this review.

## What this establishes

Both the 6,732-prompt-token whole-file request and the 1,790-prompt-token function-only request consumed the same 4,000 generated-token limit. Shrinking context did not produce a completed answer for this task under the selected profile. Neither run approached the requested 16,384 context size by the reported prompt-plus-generated counts. This is an output-limit completion failure, not evidence that the reader failed to collect source, a transport timeout, or proof of a general model incapability.

The provider's final envelope supplies the length reason and token count directly. The transport forwards that JSON without stripping final text. Private thinking was not retained or inspected; no specific internal reasoning failure is inferred. The test supplies no evidence about which different generation policy would complete reliably, and mere completion would not establish semantic accuracy.

## Read-only deployment capture

The local `/api/version`, `/api/tags` and `/api/show` endpoints were read without generating text, downloading a model or changing settings. Their full response is saved as `installed-model.json` beside the archived run.

- Ollama reports version `0.40.2`.
- Installed tag: `qwen3.5:4b`; digest `96f38c742e0a10e194b237d2ffb8b55925ebfeed9d27df72688f565e773569e7`.
- Model metadata reports GGUF, qwen35 family, 4.7B parameters, Q4_K_M, llama.cpp runner, and thinking capability. This metadata does not establish an installation defect.
- Advertised model parameters include presence penalty 1.5, temperature 1, top-k 20 and top-p 0.95. The pilot explicitly requests temperature 0, seed 42, context 16384 and generated-token cap 4000, but leaves several sampling parameters unspecified. The metadata capture is not a trace of every effective runtime option. Do not infer causality from these defaults or silently change them.

## Decision

Stop repeating or further shrinking this explanation request. Preserve evidence-only operation; do not enable production background summaries. The deterministic collector, cache, source provenance and invalidation tests remain useful, but the synthesis stage has not met its completion or accuracy requirements.

Do not automatically disable thinking or raise the cap. The October 6 saved evaluations already found that disabling thinking improved completion while degrading several behavior predictions; larger caps also previously failed on a loop case. Those results do not directly score this explanation task, but they rule out presenting either toggle as an established general remedy.

The next investigation, if continued, should isolate inference/profile and response-contract effects against this frozen request and captured model identity, with a small predeclared comparison and stop rule. It must score completion separately from source truth, conditions and citations, and keep every result in the test store. This review does not start that experiment or require another user terminal rerun. No production settings or code were changed, so no new code regression run was necessary.
