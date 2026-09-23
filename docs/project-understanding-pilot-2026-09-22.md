# Project understanding: first lifecycle slice

## Existing machinery and connection points

| Existing component | Reuse / limit |
| --- | --- |
| `core/sourceReader.js` | Restricted backend/src reads, real-path containment, full-file SHA-256, coverage and version guards. Reused directly. |
| `core/projectCache.js` | File inventory and in-process change detection; not durable understanding. Existing reads can advance its baseline, so it is not a durable knowledge-freshness ledger. |
| `reasoning/sourceInspection.js` | Bounded multipage review reads; may return partial evidence. Pilot requires complete source instead. |
| `reasoning/validatedAnalysis.js` | Existing distinction between checked source locations and unverified behavioral predictions. Pilot uses the same exact/unique quote-location rule, not semantic certification. |
| `memory/projectRegistry.js`, `projectMemory.js`, `core/contextManager.js` | Project identity and conversational retrieval exist. Current project-memory records have no dedicated source-version/verification contract. Project selection does not change sourceReader's fixed Atlas backend root. |
| `learning/worker.js`, `tasks/taskManager.js` | Background scheduling exists, including a passive web-learning worker. No connected durable source-understanding lifecycle was found. Scheduling is deferred for this pilot. |

## Implemented slice

Explicit commands in the real conversation engine:

```text
Learn Atlas file src/agents/agentProfiles.js
Recall Atlas file src/agents/agentProfiles.js
```

Learning reads one complete file (at most 200 lines and the existing 8,000-character numbered-read budget), asks the existing coding specialist for cited interpretations and unresolved questions, validates quote locations, rechecks the source version, and atomically saves a local record. A quote with a wrong line number is relocated only when it matches exactly one source line. Matching a quote does not establish that it supports the claim.

Records live in `backend/.local/project-understanding`, keyed by explicit Atlas project identity, agent ID and canonical source path. They include source hash, time, model, coverage, interpretation status, observations/citations and questions. This is a separate local pilot store, not a new Supabase table or human-preference memory. No database migration or production database write was performed. Audit runs use their own separate store under `.local/project-understanding-audits`.

Recall reads the current source version and presents the stored interpretation without generation. Unchanged learning also avoids generation. Changed source returns a stale notice on recall; learning replaces the old record only after a successful analysis and save. Missing/unreadable source fails closed. Current-record replacement does not yet retain a revision archive.

Source permission is checked at the runtime entry point. Only anchored explicit commands invoke this path; explanation/negation wording does not. The service admits one operation at a time, caps generation at 45 seconds, honors session closure and preserves the previous record on generation, citation, source-change or write failure. It does not coordinate GPU use with every other application subsystem yet. No generated code/tests are executed.

## Validation and model observation

- Offline suite: 90/90 test files passed. Subsequent citation relocation and user-facing error handling passed the targeted lifecycle and conversation integration tests again.
- Routing boundaries: 24/24 passed.
- Lifecycle tests cover disk persistence/reopening, unchanged skip, refresh/stale detection, agent isolation, invalid citations, incomplete source, cancellation, timeout, edits during generation and failed writes.
- Real conversation integration uses the real source reader and in-memory pilot repository; storage, speech and model are isolated. Learn, recall and unchanged skip pass through `handleMessage`.
- Two sequential local-model attempts: first rejected wrong citation line numbers; after exact unique-quote relocation, the second completed save, store reopening, recall and unchanged skip with one model call. Report: `backend/.local/project-understanding-audits/1790115367206/report.json`.
- Manual review: descriptions were broad and shallow. The model asked questions answered by visible source and attached an invalid-agent-ID line to a general fallback explanation. Those are semantic weaknesses, despite the quote existing. Records remain `interpretation_unverified`; no behavioral knowledge certification is claimed.

Reproduction from backend: `node scripts/auditProjectUnderstanding.js`. This writes only to a separate audit directory and uses local Ollama. Existing global model/thinking policies are unchanged.

## Live acceptance

Restart the backend, then:

1. `Learn Atlas file src/agents/agentProfiles.js` — expect a saved local interpretation with source version and explicit unverified status, or an honest failure if the model output is unusable.
2. `Recall Atlas file src/agents/agentProfiles.js` — expect the stored interpretation and matching version, without a model call. Also try after restarting to check persistence.
3. `Learn Atlas file src/agents/agentProfiles.js` — expect an unchanged-source message and no model call.

No source edit is needed for acceptance; controlled stale/refresh behavior is covered offline. Inspect content quality separately from lifecycle success.

## Boundaries and next step

This is a manually triggered one-file store/recall pilot. It does not yet answer arbitrary new questions from stored understanding, inject records into general conversation, inspect dependencies, invalidate dependent files, scan in the background, switch filesystem roots, track task completion, or update world knowledge. Those capabilities are not enabled by storing a summary.

Next bounded work: improve the explanation record and add a fresh-question retrieval path that treats saved interpretations as untrusted hypotheses beside current source. Establish branch/precondition accuracy before broad retrieval or background scheduling. Keep verified evidence distinct from model claims; do not fix weak understanding by silently trusting more summaries.
