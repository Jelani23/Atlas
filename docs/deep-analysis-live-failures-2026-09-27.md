# Deep-analysis live batch: failure recovery checkpoint

## Results supplied by the user

- Keywords overview: mostly correct, with imprecise wording (whitespace described as spaces; filtering and Set deduplication conflated). Follow-up failed after 303,583 ms with `fetch failed`. No semantic result exists for that follow-up.
- Search evidence: all four requested predictions were correct: false, true, true, false. Decisive branches and the lack of independent verification were correctly explained. The general summary still states marker precedence ambiguously. This is a pass for those cases, not proof of whole-answer accuracy.
- Recovery: first answer was withheld for an invalid source citation. The follow-up fell into ordinary chat and falsely said the source was inaccessible. No recovery predictions passed acceptance.
- No channel drafting was visible in the supplied answers. Speech quality was not reported.
- The logs show existing reflection-worker activity and an ordinary-chat memory-extraction attempt after the routing failure. These are not evidence that deep analysis saved verified knowledge. The extraction attempt reported SKIP; the reflection entry reported completion without revealing its contents. No production memory was inspected or modified during this repair.

## Repairs

1. Deep analysis reports its validated file and selected function to the conversation engine before model generation. A rejected model answer or transport error now retains that scope for a subsequent same-file question. Failure completion refreshes the existing ten-minute conversational scope. Cancellation clears it. Every follow-up still rereads source and checks versions; no failed interpretation is reused.
2. Contract version 4 constrains generated citation paths and line numbers to the current evidence packet. Runtime validation still checks each path/line pair and withholds invalid answers. Diagnostics distinguish an unknown path from an unknown line without logging raw model output. Valid citations still do not establish semantic correctness.
3. Requests with an explicit timeout use a bounded native HTTP envelope transport to the fixed local Ollama endpoint. Deep analysis and its audit use their existing ten-minute budget, with cancellation, a 2 MiB response cap, generic malformed-response errors, connection error codes and no implicit retries. Ordinary requests without this option retain their existing transport. The five-minute failure is consistent with a transport deadline, but the supplied logs lack its nested error code and do not prove the original cause. Live testing is required to confirm the observed failure is resolved.
4. Source-question failures now emit the failed request event and leave a FAILED task, rather than reporting SUCCESS for a failure message. The user still receives the explanation.
5. The offline harness now blocks HTTP/HTTPS request APIs as well as fetch. Transport tests use mocks; they do not contact Ollama or write production data.

## Verification

The full offline suite passed **119/119 test files**. The expanded transport checks also passed after adding pre-aborted and interrupted-response cases. The final diff whitespace check passed.

Focused checks passed for response envelopes, provider integration, HTTP and connection errors, malformed/oversized bodies, timeouts, pre-aborted and active cancellation, interrupted responses, and absence of automatic retries. Engine regression checks reproduce invalid-citation and transport failures on recovery, then verify the next same-function question receives current recovery source through deep mode. They also check FAILED events/task state and existing cancellation behavior. Citation schema bounds and runtime rejection remain covered.

No new model calls, commits, migrations, production memory writes, autonomous patches or learning configuration changes were made. Existing uncommitted work was preserved. Prompt/schema changes reduce opportunities for invalid citations but do not prove model compliance or semantic correctness.

## Next live test

Restart the backend. Repeat pairs A and C from `deep-analysis-batch-checkpoint-2026-09-27.md`, in separate fresh conversations, sequentially. Pair B need not be repeated now.

If an initial answer fails, still send its paired follow-up. It should remain in deep analysis on the same source; ordinary-chat claims of inaccessible source should not recur. Save the full response and logs including `[DeepAnalysis]` diagnostic codes. Failures should now show a failed performance snapshot. Do not deliberately inject channel-control tags to trigger a failure; the source-tag limitation is already established.

Keywords expected: `['test123']`, `['caf']`, empty Set for whitespace/null/0, and TypeError for numeric 7. Recovery expected: `"bcXYZ"`, `"ijXYZ"`, `"XYZ"`, `"done"`, `""`. Explanations must match the ordered transformations, early returns and exact loop bounds.
