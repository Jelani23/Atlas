# Opt-in Alice application pilot

We have a TypeScript compiler + dependency-cruiser evidence collector and local Qwen 3.5 4B outline generation. The isolated live workflow passed all four lifecycle checks. Code-purpose explanations remain unverified and are not suitable for automatic knowledge promotion.

The application integration is disabled by default. When enabled, AtlasInterface starts a task-manager-only pilot after initialization, waits ten idle seconds before starting, and checks again every thirty seconds. Message calls and conversation transitions hold the pilot, abort its active work and await client settlement before proceeding. Holds are released in finally, including failure and early-return paths. Shutdown stops the pilot before session finalization. The standalone legacy readline entry point is not integrated.

Background model requests share the existing memory LLM queue. Cancellation while queued settles promptly; the queued callback later skips inference. Cancellation during inference waits for transport settlement. This does not prove server-side GPU cancellation or make existing non-pilot background requests preemptible. The existing audio interrupt button is not treated as completion of a still-running message.

Evidence remains in `backend/.local/connected-evidence-test`; no pilot claims are added to production memory or chat context. Do not run the standalone evidence/workflow commands concurrently with this pilot. `[ConnectedEvidence]` backend logs show scheduling, collection, summarization, yielding, completed outcomes, and failures. `getState` includes `connectedEvidencePilot` diagnostics. A completed batch can contain an evidence-only model failure: inspect its outcomes rather than treating idle as semantic success. Collector timings on reused graphs describe the original collection, not a new compiler pass.

## Next live check

Stop any existing Alice development process. In a PowerShell terminal at the project root:

```powershell
$env:ATLAS_CONNECTED_EVIDENCE_PILOT = 'true'
npm run dev
```

After the backend reports ready, wait for `[ConnectedEvidence]` to show `summarizing`, then send an ordinary chat message. Expect `yielding` (if inference is still active), a normal reply, and a later idle background run. If analysis already completed, the message still holds the scheduler but there is nothing to interrupt. Keep the relevant backend logs, including any failures, for review. This test does not require editing source: dev mode restarts the backend on source edits, so the earlier copied-source rehearsal remains the source-refresh test.

Stop the application and disable the flag before returning to normal development:

```powershell
Remove-Item Env:ATLAS_CONNECTED_EVIDENCE_PILOT
```

The flag is intentionally not enabled in either real .env file. Offline tests cover delayed settlement, overlapping holds, failure cleanup, cancelled queue entries, disabled startup, shutdown, and the real interface's dispatch gate. The first actual application run completed analysis, answered a normal chat in 2.86 seconds, and reused evidence afterward in 793 ms. It did not exercise active interruption because inference had already finished.

## Controlled rerun and focused analysis

With the opt-in application running, use a second terminal at the project root:

```powershell
node backend/scripts/reanalyzeConnectedEvidence.js execution
```

This requests a rerun from the existing backend over its local WebSocket connection. It acknowledges scheduling, not completion. Busy/disabled/not-ready states reject the request. It preserves the previous answer and packet as `review-before-rerun-*.json`, changes the inference cache key, and schedules after ten idle seconds. No source edit or evidence deletion is needed. Send a chat message when the backend reaches `summarizing` to test interruption.

Supported focuses are `execution` (_executeTask), `cancellation` (cancelTask), `creation` (createTask), and `overview` (file-level). Function packets are capped at 12,000 characters and contain the full requested method, up to two compiler-resolved caller contexts, referenced definitions, and syntax operation observations with guards, prior exits/awaits, and exception-region context. Omitted callers/definitions/operations remain counted. A caller edge is not proof that the call executes at runtime. These packets are groundwork for deeper behavior analysis; purpose prose and model selection remain unverified.

TypeScript and dependency-cruiser are already integrated. This change makes more of the compiler's caller evidence available to the model rather than installing another analyzer. Review the persisted packet and answer before concluding that more context improved accuracy. Do not use the standalone evaluator concurrently with the application pilot.
