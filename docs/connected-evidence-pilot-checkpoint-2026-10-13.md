# Isolated analysis pilot checkpoint

The current pilot combines TypeScript definitions/references/types and operation observations, dependency-cruiser module edges, bounded connected source/test/doc packets, and optional local Qwen 3.5 4B outline generation. Model-selected operation records are copied exactly from collector output. Purpose prose, model questions and selection completeness remain unverified. No production learning or application-startup hook is enabled.

## Lifecycle fixes

- Source freshness checks run in a worker and hash the snapshot without constructing a compiler graph, invoking a model, or publishing evidence files. Stale review inspection no longer creates another full snapshot.
- Review retrieval rejects incomplete generations, missing records, changed source, and publication changes during its final check. It returns no claims when freshness fails. Cached batches receive a final source check before being marked complete.
- A model deadline aborts only that model request and stores an evidence-only failure, so unchanged scheduled polls reuse the failure. A provider that ignores abort retains the active lock until it settles; its late answer is withheld. Foreground cancellation still interrupts the entire background run and discards its unpublished answer.
- Collector metrics explicitly identify reuse of previous collection results.
- CLI review output records when source freshness was checked. Static Markdown reports remain snapshots, not automatically updating knowledge.

## Store preservation

Early raw JSON evidence snapshots were losslessly compressed after streaming SHA-256 comparisons against the decompressed copies. A conflicting destination or changed original prevents removal of the original. Existing archived evidence filenames continue to resolve through the shared reader. No source records, original model answers or evidence content were pruned. Five snapshots freed 227,769,951 bytes; the compaction manifest is retained in the test store. The 256 MiB snapshot quota remains enforced.

## Commands

The next live test is the isolated scheduler/interruption/cache/source-refresh rehearsal described in [the workflow test notes](connected-evidence-workflow-2026-10-13.md). Stop Alice's backend, keep local Ollama available, then run:

```powershell
node backend/scripts/evaluateConnectedWorkflow.js --live
```

It uses copied source and simulated application lifecycle events; production startup remains unchanged. Results are retained separately under `backend/.local/connected-workflow-test/run-*`.

Inspect current record freshness without generation, graph rebuilding or persistent writes:

```powershell
node backend/scripts/reviewConnectedEvidence.js
```

Refresh tool evidence and readable review without a model request:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --profile=outline
```

Optional local model evaluation, with Alice's backend stopped and Ollama available:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live --profile=outline
```

Reports live under `backend/.local/connected-evidence-test`. The latest model evaluation before this lifecycle pass remains preserved under `purpose-boundary-final-2026-10-13`; a subsequent evidence-only refresh does not transplant those old interpretations onto new source. `last-review.md` provides current collected observations after refresh. Only the freshness-inspection command checks persisted records against files at the time it runs.

## Validation and release limits

Offline tests cover current/stale/incomplete review states, publication races, cached timeout failures, ignored-abort providers, foreground interruption, source changes during generation, dependency invalidation, exact operation copying, and lossless archive recovery/conflict handling. Logs for the final full suite are at `offline-tests-pilot-final-2026-10-13.log` in the isolated store. Earlier model evaluations remain accuracy evidence, not implementation test passes.

The prototype is suitable for isolated evidence collection and supervised review. It is not validated for reliable autonomous semantic knowledge. Pattern rules can miss unsupported prose and reject valid prose; lexical observations are not full control-flow proofs; dynamic dispatch and omitted context remain unresolved. Additional prompt or model retries do not remove these limitations. Promotion of inferred knowledge and production background scheduling remain disabled.
