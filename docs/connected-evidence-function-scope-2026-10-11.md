# Task-manager second limit failure and smaller task

The user ran `--live --case=task-manager` with the coherent whole-file packet. The run took 51.530 seconds overall; the provider reported 50.860 seconds, 6,732 prompt tokens, 4,000 generated tokens and `done_reason: length`. Unlike the first attempt, this response contains a small amount of unfinished final JSON. It is still incomplete and was correctly kept as evidence-only. Do not reconstruct an answer from it, treat its partial claim as a scored explanation, or infer the private thinking-token count.

The exact record and run report were copied before further edits to `backend/.local/connected-evidence-test/task-manager-limit-2026-10-11/`. The record hash is `0069910f76e779220e54cf2eba3677bf49f67572beca9c6b54c0be1237fec9d7`; it references original snapshot `5eb6b8b1c6a6c353321f8478095c17ed4e74d7e5712752138f6cdc125dd2a362`. The original versioned source/evidence remains stored. No further model request was made in this development pass.

## Decision and implementation

Stop repeating this whole-file request. Keep Qwen 3.5 4B, thinking, temperature, seed, context size and output cap unchanged. Instead add a distinctly scoped `task-cancellation` case: explain only the `cancelTask` method, its conditions, operations and evidence limits.

The generic function-context builder requires one unique function or method declaration. It includes that complete declaration, then compiler-resolved definition nodes referenced from inside it and bounded relationships. It rejects missing/ambiguous functions and functions that cannot fit whole. It does not include nearby files or sibling methods merely because they are nearby. Broader definition nodes are omitted when narrower property definitions already supply the referenced source. Omitted definitions and relationships are counted; runtime values remain unproven.

The context cap is 5,000 serialized characters, compared with 20,511 characters for the failed whole-file packet. All evidence IDs begin with actual function source rather than a file-metadata record. The output schema and source-anchor requirement stay the same. The task instruction changes only to describe the function scope; this is not a controlled test of a prompting trick, nor an assertion that more facts cure semantic errors.

The method does not supply the full cooperative-work lifecycle. Its result must not be presented as a task-manager or repository summary. The scope warning explicitly withholds conclusions about callers, other methods and the whole file. In particular, marking state as cancelled must not be extrapolated into forced termination of arbitrary ongoing work. This criterion is recorded for review, not supplied as a reference answer to the model.

Offline regression coverage checks complete target inclusion, real referenced definitions, unrelated-file exclusion, bounds, and missing/ambiguous target rejection. The existing source/citation, stale-record, cancellation and scheduling tests still apply. The standalone evaluator prints the selected case to distinguish whole-file from function-only results. Production routing and background learning remain untouched.

## Next live boundary

With ATLAS's backend stopped and Ollama running, the next distinct test is:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live --case=task-cancellation
```

It makes at most one local call, with the same 4,000 generated-token cap. Evaluate completion separately from claim correctness, guard retention, mutation/event details, exact citation support and justified uncertainty. The expected source coverage is only the selected method and directly referenced nodes. A successful answer does not establish full-file understanding. If this small task also consumes the limit or invents behavior, keep evidence-only operation and investigate the inference/completion failure before adding more background summarization.
