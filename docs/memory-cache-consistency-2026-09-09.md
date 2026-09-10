# Memory-cache consistency follow-up

After the user confirmed migration 012 and its SQL assertions, the live read-only review queue returned zero pending proposals. No additional database writes or reverifications were performed.

## In-flight invalidation

Previously, a database read started before an invalidation could finish afterward and repopulate the warm cache with outdated rows. Concurrent requests could also issue duplicate reads and race to publish their results.

`generationCache.js` owns each pending/cache entry by generation. Invalidation detaches the old entry. Its late results and errors cannot replace the current generation. Callers still awaiting an invalidated read retry against the current generation, sharing an already-started load when available. Three invalidations during a single read exhaust its retry budget and raise an explicit error instead of looping indefinitely or serving the obsolete result.

`memoryCache.js` applies this to profile, project, knowledge, development-state, procedure, and reflection loads. Existing hot-state invalidation remains in place. Storage failures propagate and are not cached as successful empty results; a later request can retry. Load logging no longer uses shared console timer labels, which could overlap during invalidation.

## Validation and limits

Added deterministic deferred-promise tests for coalescing, late success, late failure, global clearing, empty results, failed-load retries, bounded churn, and integration across all six stores. No live concurrent write test was performed.

All 38 targeted local test files passed: 33 knowledge/canonicalization/cache/provider checks plus five context and reflection regression files. `git diff --check` passed; Git only reported line-ending normalization warnings.

This is in-process warm-cache consistency, not a database subscription or cross-process invalidation mechanism. Administrative CLI writes still require a backend restart before immediate recall validation. It does not retract data already handed to a running context build or make an entire multi-store context read transactionally consistent. No new migration or user SQL is required.
