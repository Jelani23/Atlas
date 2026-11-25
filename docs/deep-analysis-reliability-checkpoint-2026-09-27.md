# Phase 1 deep-analysis reliability checkpoint — 2026-09-27

## Changes

- `backend/src/reasoning/analysisContext.js` now emits schema 2, `analysis-context-2`. Its evidence policy separates source facts, deterministic analyzer limits, missing information and model inference. Unsupported analysis does not mean supplied source cannot be reasoned about. Missing helper records do not necessarily mean missing source bodies. Model predictions remain unverified interpretations, with citations and assumptions required.
- Full source snapshots and existing analysis fields remain intact. Exception regions and call conditions, regions and candidate handlers now travel with the packet. This exposes catch scope without claiming complete exception semantics. Packet version and content continue to affect the cache key.
- `backend/scripts/deepAnalysisResponse.js` adds shared, non-destructive diagnostics. Complete transport requires an assistant string response, nonempty content, `done: true`, an explicit `stop`, and no unexpected tool calls or malformed thinking field. Length exhaustion, missing stop metadata and malformed responses are incomplete. Tags and possible drafting produce review warnings; legitimate source examples are preserved verbatim. Native thinking is counted, never retained.
- `backend/scripts/auditDeepAnalysis.js` uses the evidence policy and diagnostics. Freshness failures before a model call and around oracle execution are checkpointed as failures/incomplete rows. Completed transport still ends at manual review, never trusted knowledge.
- `backend/scripts/auditDeepAnalysisChannels.js` adds a controlled four-call local probe: ordinary/tag-containing source strings, each with thinking off/on. Calls are sequential, with temperature 0, 4096 context tokens, 2048 shared generation tokens and a 120-second timeout. The probe checkpoints each call and handles SIGINT/SIGTERM cancellation. Its exact JSON contract check is specific to this fixture, not a general semantic verifier.
- Extended `analysisContext.test.js` and `deepAnalysisAudit.test.js` for catch scope, preserved source despite omitted records, response integrity, malformed/partial responses and preservation of literal tags.

## Verified

- Full network-disabled offline suite: **115/115 test files passed**. Focused packet/audit checks passed again after the final runner adjustment; channel runner syntax check passed.
- Inspected actual search and JSON packets: 22,527 and 22,300 serialized characters, both below the audit's 48,000-character limit. Neither had packet omissions or unresolved dependencies. The JSON packet places `text.replace` outside the catch and `JSON.parse`/`substring` inside it.
- Re-examined all eight saved audit answers in `1790538344826.json` and `1790538465233.json`. Both thinking-enabled JSON answers start mid-fragment despite normal stop metadata. Historical artifacts do not retain every raw response-envelope field, so this inspection cannot retrospectively validate the complete protocol envelope.
- Four new sequential calls to the configured local model completed. Artifact: `backend/.local/deep-analysis-audit/channels-1790539084958.json`.

| Source string | Thinking | Exact JSON contract | Native thinking characters | Generated tokens | Time |
| --- | --- | --- | ---: | ---: | ---: |
| Ordinary | Off | Pass | 0 | 22 | 12.6 s |
| Literal thinking tags | Off | Pass | 0 | 23 | 0.6 s |
| Ordinary | On | Pass | 3135 | 802 | 15.9 s |
| Literal thinking tags | On | Fail | 179 | 506 | 10.3 s |

All four reported `done: true` and `done_reason: stop`; none exhausted the generation budget. The failing answer began mid-fragment, included drafting and eventually substituted an unrelated string. The diagnostic flagged both literal tags and possible drafting. No content was filtered or repaired. The two tag outputs demonstrate why the mere presence of tags cannot serve as a failure verdict: the non-thinking answer preserved them correctly.

## Limits and next step

This single paired probe reproduces an association between literal tags and a thinking-enabled output failure. It does not isolate model behavior from provider/template/channel parsing, establish a failure rate or cover streaming. Diagnostics are heuristics and cannot certify prose completeness or semantic correctness. A normal stop remains insufficient evidence of a usable answer.

The evidence policy improves the input contract; this pass did not rerun the larger search/JSON reasoning tasks, so improved explanation accuracy is not established. Existing model failures remain regression evidence. Checkpoint files preserve completed work, but automatic resume/retry is not implemented; an abrupt process kill can leave a running checkpoint that must remain unaccepted.

Next bounded investigation: isolate channel handling with additional paired source-string probes and inspect local provider/template behavior before exposing deep analysis to speech or storage. Keep inference, transport completion, channel review and semantic acceptance separate.

**No live Alice test is needed yet.** Interactive routing and global model defaults were unchanged. No commits, migrations, production memory writes, autonomous patching or background learning were performed. Existing uncommitted work was preserved.
