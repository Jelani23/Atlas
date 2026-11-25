# Isolated live workflow rehearsal

With Alice's backend stopped and local Ollama available, run from the project root:

```powershell
node backend/scripts/evaluateConnectedWorkflow.js --live
```

This is a lifecycle test rather than another prompt-quality evaluation. It copies the collector's bounded source/config/document snapshot into a fresh folder under `backend/.local/connected-workflow-test/run-*`. It does not modify the working source, execute copied modules/tests, load production memory, or enable background learning in Alice.

The script starts the pilot's real idle scheduler and compiler/dependency workers, begins a local Qwen 3.5 4B outline request, and emits a simulated foreground-start event after 200 ms. It waits for the background client request to settle, verifies no interrupted record was published and background work is deferred, and sends a short foreground request to the same local model. A simulated completion event resumes background analysis. It then checks that unchanged source reuses the cache without another model request. Finally it appends a comment to the copied task manager, verifies that recall rejects stale records, and checks scheduled refresh against a different snapshot version.

Expected output: `status: "passed"` and four passed checks: `foreground_interrupt`, `foreground_response`, `idle_resume_and_cache`, and `stale_rejection_and_refresh`. A failure exits nonzero with its error and completed checks. Each run retains `report.json` and the copied pilot store for inspection. Ctrl+C aborts active work. An exceptionally fast first model answer can complete before interruption; that run fails because cancellation was not exercised.

This uses simulated application events, not the running chat UI. Client request settlement does not establish when Ollama frees GPU work after disconnect. Completed outlines remain unverified interpretations; passing does not establish semantic accuracy or authorize knowledge promotion. The next integration decision should use the observed live interruption/resumption behavior.

Offline validation uses real compiler workers over a small static fixture and a simulated provider that settles late after abort, with assertions against overlapping client requests. It also verifies a pre-cancelled workflow makes no model call. The test is registered in `testMemoryOffline.js`.
