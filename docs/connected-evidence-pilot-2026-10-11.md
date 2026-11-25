# Connected evidence pilot — October 11, 2026

## Status and boundaries

An offline end-to-end prototype now collects connected JS/TS evidence, builds bounded context packets, caches results, and saves them in `backend/.local/connected-evidence-test`. It is not imported by production startup, conversation routing, passive learning or knowledge storage. No model call was made during implementation. Alice's Qwen 3.5 4B configuration and the existing Checked analyze route are unchanged.

Run the offline pilot from the repository root:

```powershell
node backend/scripts/evaluateConnectedEvidence.js
```

It evaluates the conversation engine, task manager and local envelope transport together with graph-connected source, cancellation tests and explicit documentation mentions. It never requires the analyzed modules, emits JavaScript, executes test source, or runs model-generated tests. Existing authored offline regression tests are run separately.

## Reuse and implementation

- TypeScript 5.9.3 was already installed. The collector uses a bounded virtual compiler host over `backend/src`, `backend/tests`, sibling `docs` and package/config metadata. Only TypeScript's bundled standard library declarations are additionally readable. The compiler options are explicit; project configurations, plugins and external package declarations are not loaded. Missing Node/package types therefore produce expected diagnostics and uncertain types.
- Records preserve original source, SHA-256 file hashes, implementation/version binding, locations and spans, definitions, exports, identifier references, compiler types, resolved call signatures, imports, diagnostics, unresolved imports/calls and truncation counts. Compiler call resolution is not a runtime execution guarantee. No diagnostics is not a correctness finding.
- The event extractor records emit/listener sites and pairs matching compiler key definitions as **unverified connection candidates**. Identical keys do not prove emitter identity or listener lifetime. Route/registration-like method calls remain syntax candidates; generic `.get` calls may be Map accesses. Dynamic dependencies and injected/runtime bindings remain uncertain.
- The independently installed local `dependency-cruiser@18.5.0` runs against temporary copies of source with explicit API options, no project config discovery, no package traversal, no cache and no install scripts. It reports its graph separately. Disagreements are retained rather than silently merged into proven relationships. Reverse impact uses both old and new graphs, including deleted edges.
- Context packets are capped at 24,000 serialized characters. They distinguish source excerpts, tool findings, unexecuted test source, documentation claims and unverified model interpretation. The evaluation explicitly prioritizes cancellation terms and selected connected files. This is a focused evaluation selection, not a general relevance benchmark. Files must have an actual graph relation to be selected; directory proximity is unused. Large functions and tests are excerpted, with omissions retained. The complete original source stays in the evidence snapshot.
- The scheduler reuses the existing request event names. It coalesces targets, polls only when idle, tracks overlapping foreground request IDs, aborts its compiler worker/model signal on a new request, and refuses a second background run until the first provider settles—even if it ignores abort. Stop removes listeners and timers. No speech or chat delivery exists in this prototype.
- The standalone live adapter reuses `ollamaEnvelopeTransport.requestEnvelope`, pins `qwen3.5:4b` on localhost and bypasses hosted-provider routing. It requests thinking, temperature 0, seed 42, context 16384, output cap 4000 and a 600-second deadline. This is a new explanation task, not another prompt experiment on behavior predictions.

The production passive learner was not reused as a worker because it writes knowledge through Supabase. The old project-understanding store was not reused because it can address production records. The new fixed test namespace is independent of both. No credentials, hosted quotas, model downloads or production knowledge writes are needed.

## Storage, freshness and resource limits

Each generation has a content-addressed `evidence-<snapshotVersion>.json` containing source and structured findings. Per-target records retain their exact packet, original evidence filename and optional model request/final response audit. Private thinking output is not saved. `graph.json` holds compact scheduler metadata; `current.json` is a generation marker, not proof of freshness. `invalidation.json` records changes and advisory reverse impact; `last-run.json` records timings.

Recall checks current file hashes instead of trusting the marker. Every source/config/document/test or analyzer implementation change invalidates **all** summaries in this initial prototype. That is deliberately more conservative than the graph impact set because dynamic relations may be missing. Edits during generation discard the result. Deleted targets become tombstones. Newly created dependencies invalidate previously unresolved claims. Old versioned evidence remains available for audit.

The snapshot is bounded to 1,500 files, 512 KB per source file and 16 MB aggregate source, plus bounded config metadata. Per-file findings and diagnostics have explicit caps. Compiler work has a 60-second timeout and a 384 MiB worker heap limit. Stored versioned snapshots have a 256 MiB quota; the prototype stops with an explicit error rather than deleting audit evidence automatically. Development-only legacy `evidence-snapshot.json`, if present, is not used by current records. Compiler work, raw evidence serialization and large source loading run off the main event loop. Cancellation also cleans temporary copied source after worker termination.

Unchanged snapshots skip TypeScript, dependency-cruiser and the model. Invalid/incomplete model output is retained as an audit failure with evidence-only status and is not automatically retried on every poll. A source/context change permits a new attempt. Model citation validation checks that evidence IDs exist, **not whether those IDs support the claims**; all accepted prose is still unverified. Coverage and omissions are stored independently so a model cannot erase them.

## Offline findings and evaluation limits

Real-file comparison initially exposed three extraction defects: synthetic CommonJS `require` declarations were mistaken for shadowing, destructured default parameter expressions were mistaken for bindings, and trailing-slash directory imports were missed. These were fixed and covered by focused regression cases. A subsequent repository scan compared **843 unique internal module edges**, with no TypeScript-only or cruiser-only edges on that snapshot. The graph also contained 104 same-key event connection candidates. These figures measure a specific snapshot and module-graph agreement, not semantic correctness or general extraction recall.

The focused test suite covers imports (including CommonJS/default parameters/directory imports), declarations/types/calls, shadowed and dynamic require, unresolved connections, candidate events, budgets and evidence classes; edited/deleted/recreated dependencies and changed documentation; stale in-flight model output; cache/deduplication; real scheduled polling; overlapping foreground requests; cancellation with a provider ignoring abort; timeouts; shutdown; failed-response retry suppression; old/new graph impact; and real worker + dependency-cruiser collection with original evidence persistence.

An observed cold run collected 497 files in about 11.7 seconds overall (8.7 seconds TypeScript, 1.2 seconds dependency-cruiser), with a 123 MiB measured worker heap and a 34 ms maximum main-event-loop delay. An earlier unchanged run took 334 ms and skipped both analyzers and all summaries. These are single-machine offline observations, not live conversational latency guarantees. The original evidence was about 49 MB. Current figures are saved by each run; source changes alter counts and timings.

The broader offline suite passed **128/129** files. `capabilityContext.test.js` fails on `Undocumented tool puzzleHelper`: the pre-existing uncommitted `src/tools/index.js` exports puzzles while the capability catalog does not list that tool. This task did not change either file. Puzzle work remains deferred. The new focused test file passes. No claim is made that the full suite is green.

Alice's explanation accuracy, completeness, condition retention and uncertainty preservation remain **not evaluated**. Offline model responses in tests are stubs. Prompt/citation validity must not be scored as model reliability. No live transport contention or real desktop event integration has been tested; the event tests are simulations, and the scheduler is intentionally not connected to production.

## Next live boundary

The first live check is a standalone evaluation, not a chat command. With the normal ATLAS backend stopped so it cannot compete for the local model, and Ollama already serving the installed model, run:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live
```

No server/model installation or restart is performed by the script. It makes up to three sequential local calls and stores unverified results only in the test namespace. Ctrl+C aborts pending work. There is no cross-process foreground-event connection in this command: leaving the production app active would not test conversational yielding safely.

Review each saved claim against its exact packet and original source, separately scoring: purpose accuracy; behavior accuracy; omitted important conditions; unsupported additions; citation support; and justified uncertainty. Pay particular attention to new-message cancellation, waiting for abort settlement, task state checks, timeout/error handling, and absence of late delivery. Test-source assertions describe intended behavior unless an independently recorded test result is supplied. Insufficient packet coverage should be recorded as a retrieval gap, not corrected by assuming the model saw omitted source.

Only after that review should a test-only in-process hook be considered for real foreground contention. Production background learning and production knowledge remain disabled for this prototype.

References used for tool integration: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [dependency-cruiser API](https://github.com/sverweij/dependency-cruiser/blob/main/doc/api.md), and [dependency-cruiser JSON format](https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md).
