# Connected evidence: explicit summary profile

The isolated pilot now offers `--profile=summary`: the same local Qwen 3.5 4B, native thinking disabled, with an explicit JSON schema and citation IDs restricted to supplied text excerpts. The existing default `reasoning` profile retains thinking. This is an opt-in completion workaround for unverified summaries, not a repair to general model reasoning, a global model setting change, or approval for production background learning.

## Controlled local checks

Frozen requests were replayed without collecting new source or executing analyzed code. Seed, temperature, context and the 4,000-token output budget were held fixed. Only final answers and envelope metadata were retained. Installed model digest was unchanged from the captured deployment.

| Check | Result |
| --- | --- |
| Frozen cancellation request, presence penalty 0 | Empty final answer, length, 4,000 tokens, 62.2 s |
| Same request, original penalty, no JSON format constraint | Empty final answer, length, 4,000 tokens, 44.1 s |
| Three coherent real-file packets, thinking off, JSON-only format | All completed in 6.4–10.7 s; all rejected for malformed claim/citation structure |
| Same three packets, thinking off, explicit schema | All completed and passed structure/source-anchor validation in 5.4–6.4 s, 417–490 generated tokens |
| Fresh full pipeline, function-scoped cancellation, summary profile | `unverified_summary`, 17.3 s overall; model 5.4 s / 400 tokens; collector 8.6 s; maximum event-loop delay 35 ms |
| Immediate identical full-pipeline rerun | `cached`, 366 ms, no model request |

The fresh collector compared 849 agreed module edges, with zero compiler-only or cruiser-only edges. These counts describe agreement between tools, not proven completeness of runtime connections.

Artifacts are in `backend/.local/connected-evidence-test/`: `completion-probe-1791760928919.json`, `summary-probe-1791761096996.json`, `schema-summary-probe-1791761162321.json`, and `summary-profile-2026-10-11/`. Original failed runs remain preserved separately.

## Source review: still not a semantic pass

Schema enforcement fixes malformed output and nonexistent/metadata-only citation choices. A real excerpt can still fail to support a claim. No source-truth verification is inferred from successful parsing.

- Whole task-manager summary omits RUNNING/QUEUED/CREATED conditions from its cancellation claim. One extra citation is merely a background-router import. Its creation summary also simplifies the falsy `parentTaskId` condition and parent-failure release path.
- Conversation summary simplifies timing as cancellation “immediately upon message handling” and does not adequately describe the `previous.deep` restriction and wait for the prior turn. It is incomplete as a cancellation explanation.
- Transport summary broadly reflects the source and mock-test intent, but mixes intended test behavior with runtime assertions. Its statement about abort error codes depends on external HTTP behavior/mock assumptions. It is not a runtime proof.
- Fresh function-scoped cancellation summary retains the task-state guard and absent-task no-op, but then lists absent-task behavior as unknown. Its description of `startedAt || now` also says “no start time” rather than precisely describing falsy values. This is a semantic consistency/precision failure despite successful completion.

All results remain `MODEL_INTERPRETATION_UNVERIFIED` in the isolated test store. Production background learning remains disabled. Reliable automatic knowledge promotion has not been established.

## Implementation and checks

Generation policy is centralized in `evidencePilot/generation.js`. Its profile hash now participates in summary cache eligibility, so a changed profile can replace an old failure without editing source. Identical failures remain cached rather than retried repeatedly. Packet fingerprints still distinguish context changes. The runner reuses the existing response-envelope inspector to reject wrong roles, unexpected tool calls, missing/empty content and incomplete generation. Reports distinguish pipeline completion from `synthesisStatus`.

Final focused connected-evidence tests passed, including profile changes after failure, same-profile deduplication, excerpt-only schema choices and malformed envelope rejection. The full network-disabled suite run passed 129/130 files; the existing failure is `capabilityContext.test.js`, reporting `Undocumented tool puzzleHelper`. Deferred puzzle work was not modified. `git diff --check` passed.

## Next isolated test

From the project root, with Ollama running and Alice's backend stopped to avoid competing model work:

```powershell
node backend/scripts/evaluateConnectedEvidence.js --live --profile=summary
```

This evaluates all three real files with the explicit summary profile. Expected success is `synthesisStatus: completed_unverified`; a cached result reports its `recordStatus`. The older command without `--profile=summary` still uses thinking and can reproduce the output-limit failure. No interactive Alice prompt or production learning test is appropriate yet.
