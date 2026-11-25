# Checked analysis pilot — October 8, 2026

See [the October 10 clarification fix](checked-analysis-clarification-fix-2026-10-10.md) for the live-failure diagnosis and Kokoro investigation.

October 10 correction: missing-input requests now return a normal clarification with a completed request status, not a failed task. Test 3 uses the explicit `end input` delimiter so its question mark is not treated as part of a bare string value.

## What changed

An explicit `Checked analyze` command now reaches the bounded checked-analysis service through Alice's conversation route. It requires a named function and explicit values for every parameter supported by the existing argument grammar. Missing values produce a request for values before any model call. Follow-ups preserve checked mode; an explicit ordinary Analyze or Deep analyze command selects its own mode. Ordinary conversations and existing analysis commands keep their existing behavior.

The dependency release safeguard now lives in the shared checked-prediction path, rather than only the evaluation adapter. Unverified definite predictions are withheld when dependency source is unresolved. Explicitly recorded missing runtime bindings are also preserved and checked; the system rejects a supposedly independent scenario bound to missing runtime values. Missing runtime metadata is accepted only for actual target parameters.

This is conservative release control, not proof that a dependency affects every execution. An unrelated unresolved import can still cause an unverified prediction to be withheld. Independently checked outcomes remain available. Unsupported analysis alone does not establish missing source. Unknown responses and all free-text explanations remain unverified; this does not solve the general model's reasoning problems.

After the real-model smoke test reproduced a wrong definite result on complete source, the explicit checked command was tightened further: **every requested outcome must have an independent static check before the service requests a model explanation**. Otherwise it skips the model and immediately returns supported results, if any, plus an honest limitation. A final release check also withholds any remaining unchecked prediction. This avoids wasting a model call whose result would be withheld. It does not change the evaluation harness into an oracle or rewrite model answers to the expected result.

Text and speech now distinguish dependency gaps, missing runtime values, prediction conflicts, malformed responses and model failure. Withheld model prose does not enter either channel. If the model fails and the analyzer has no supported result, the checked service says no verified result is available rather than inventing a result or silently switching to unchecked analysis. Cancellation, source-version checks and sequential model calls still apply.

In the final renderer, speech reads independently derived results and the relevant limitation, while unverified model explanations remain on screen. It does not read the model's general overview aloud as if it were a checked conclusion.

## Offline verification

The complete offline suite passed after the final release-policy implementation: **126/126 test files**. Log: `backend/.local/semantic-evaluation/offline-tests-checked-service-final-2026-10-08.log`.

Coverage includes missing runtime values, dependency gaps, unrelated imports, supported results, mixed inputs, invalid responses, stale source/input bindings, model failures, checked command routing and follow-up behavior. Conversation tests use the actual engine with mocked model and speech/storage interfaces; no production memory or knowledge is changed. Existing cancellation/session-close tests ensure no late speech or assistant writes.

The runtime-binding check uses explicit metadata in the evaluation/service API. The interactive command currently supports explicit primitive parameter assignments; it does not infer an unknown cache object from free-form prose.

## Local model smoke test

`node backend/scripts/auditCheckedAnalysis.js` exercises the actual source reader, command detector, checked service, local request builder, response parser and renderer. Inspected source is data and is not executed. It does not open a production conversation or write project knowledge. Requests use the existing general-model service policy.

The installed Ollama server is now version 0.40.0. It initially could not initialize model metadata inside the tool sandbox. Audit-only attempts before a usable model inventory returned fallback responses and are not model successes. The final audit uses a workspace copy of the installed general model with cloud access and pruning disabled. The model digest remains `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`. No downloads or paid services were used. The original model files were not changed by the audit setup.

The initial usable-model report is `backend/.local/semantic-evaluation/1791491894257-checked-service.json`. The recovery case returns the correct string Hello in 93.3 seconds, with an unverified explanation. Its citation prose incorrectly attributes both string conversions to line 6; line 7 converts the second input. The numeric keyword-extractor case completes in 57.5 seconds but incorrectly claims numbers are converted by toLowerCase and predicts an array instead of an escaping TypeError. It also invents Set-to-array conversion. Both pass the strict format, illustrating that format validity is not semantic validity.

Those findings triggered the stronger checked-command policy above. The final implementation is tested again in `backend/.local/semantic-evaluation/1791492278485-checked-service.json`: the two real-source cases now skip the model because neither has a supported static outcome. A new source-only diagnostic sample tests the supported branch without executing it. This sample is for interface delivery, not a new model benchmark or a replacement for the failing real-source examples.

The two unsupported requests return in 58 ms and 15 ms with zero model calls. The supported sample completes in 42.5 seconds with a correct string `empty`, matching the static derivation. Its per-input explanation is correct; the general overview omits preconditions for truthy nonstrings and remains unverified. The adjacent `-review.json` replays saved answers through the final service/renderer, verifies identical source snapshots and model messages, and records the final text/speech with report, answer and implementation hashes. It makes no new model call and does not overwrite the original report.

Final full-suite result is 126/126 after the speech change. Tracked and edited-file whitespace checks passed. The audit-only Ollama server was stopped and both workspace model-copy directories were removed; original installed model weights remain in place. Logs and reports are retained. All work remained free/local, with no production memory writes or commits.

## Live checks

Restart ATLAS using your usual development launch so it loads the changed backend, and start Ollama normally. Use a fresh Alice conversation. Do not enable anything in configuration; the command is explicit and experimental.

### 1. Missing inputs — no model call expected

```text
Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue.
```

Expected: a request for explicit parameter values. It must not generate an unchecked explanation. Check whether the message is readable and the interface returns from its busy state.

### 2. Complete request

```text
Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue with value set to 0
```

Expected: independently derived return value **string `empty`**, under the stated static assumptions, with no source execution. A model explanation, if available, must be labeled unverified. If the model fails, the independently derived result must still be shown. This deliberately simple diagnostic file is not imported by production modules.

### 3. Follow-up in the same conversation

```text
What does that function return with value set to 7 end input?
```

Expected: the same file/function and checked mode, with a prompt limitation response saying no verified result is available and no model interpretation was requested. The current checker does not establish this method-call error. It must not guess an empty string or string 7. Source review establishes TypeError, but the interface must not label that result independently checked when it is unsupported.

### 4. Interruption by a new message

There is no dedicated cancel button in the current UI. Repeat check 2, then send check 1 while it is processing. Expected: the earlier request is cancelled, only the parameter clarification appears, and no old answer or speech arrives afterward. Wait roughly 60 seconds to check for late output. If the first response completes before the new message, the interruption check is inconclusive.

Live checks 1–3 passed on October 10. Check 2 took 44.1 seconds total; check 3 took 766 ms total (10 ms analysis). Spoken output for check 2 remains unconfirmed. The initial interruption check failed: the new request hit the busy guard, its error appeared twice, and the older answer completed. See checked-analysis-interruption-fix-2026-10-10.md for the fix and retest instructions.

Send the full replies, backend logs, approximate timing, and any speech heard. Offline tests do not establish desktop or actual Ollama interruption behavior.
