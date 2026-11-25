# Operation outlines: preserve source conditions outside model prose

The isolated pilot adds `--profile=outline`. Qwen 3.5 4B selects operation IDs and supplies a separate inferred-purpose explanation with excerpt citations. The application joins those IDs to the collector's original records. The model cannot replace their source spans, conditions, earlier exits/awaits or exception regions. Invented IDs, duplicate selections, modified operation objects and unsupported citations fail validation.

This changes the explanation contract, not the model's reasoning ability. Selected operations remain static syntax observations; purpose, selection relevance, completeness and model questions remain unverified. A condition copied exactly can still be only one part of a larger execution path. Dynamic receivers, callback invocation, aliases and exceptions are not solved by this feature. The older summary and reasoning profiles remain available for comparison.

All available packet operations remain visible in the review report, including unselected operations and omission counts. An empty or withheld purpose explanation does not discard valid selected observations. If the packet has no operations, it may retain a cited purpose interpretation but cannot invent an operation inventory. Neither outcome enables production knowledge promotion.

## Review workflow

Every evaluation now writes both `last-review.json` and `last-review.md` under `backend/.local/connected-evidence-test`. The readable report separates model prose, collector observations, withheld statements and model questions. It includes source locations and exact branch/exit/exception text. Reports describe their recorded snapshot; editing files does not make an old report current.

Offline collection:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --profile=outline
```

When Alice's backend is stopped and Ollama is available, the next local model evaluation is:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live --profile=outline
```

The live outline contract has not been evaluated with the model in this development pass: the backend and a local model connection were active. No service was stopped or global model setting changed.

## Validation

The new offline tests use actual TaskManager source as data to verify retention of the task-existence/eligible-state condition and failure catch region. They test tampered and unknown operation selections, malformed citations, empty inventories, withheld purpose with surviving observations, visible unselected operations and safe report formatting. A stubbed end-to-end runner test verifies the new message/validation contract, exact operation copy, profile switching and unchanged-result caching. These are implementation tests, not model accuracy results.

Full-suite output is recorded at `backend/.local/connected-evidence-test/offline-tests-outline-2026-10-13.log`. Wordle implementation and other pre-existing changes are preserved. Source is parsed, never executed for analysis; production background learning remains disabled.

Current-source collection also exposed a missing JSON-module edge in the compiler graph. The explicit compiler configuration now enables JSON module resolution, with a regression fixture; this affects analysis only. The mismatch was the import of `src/puzzles/data/words.meta.json`, not a change to puzzle behavior.
