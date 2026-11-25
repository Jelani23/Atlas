# Checked-analysis clarification fix — October 10, 2026

## Reported failure and fix

The first live prompt intentionally omits the value argument. The previous implementation threw an exception, and the conversation engine marked the request FAILED. The earlier tests incorrectly accepted that exception. Missing-input detection worked, but request handling did not match the promised clarification behavior.

The checked service now returns a normal clarification naming the selected function and parameters, with reply and speech text, source identity, target coverage and a needs_parameter_values model-skip reason. No model is called. Source freshness and cancellation are checked before returning. The conversation engine completes the request and preserves the selected function for follow-up.

Regression tests cover the exact diagnostic-file prompt, successful completion events and task status, no failure event, no model calls, spoken clarification, and a subsequent input-bound follow-up.

The live checklist also had a separate ambiguity: bare 7? is text under the existing argument grammar, which deliberately preserves punctuation. The corrected follow-up uses 'value set to 7 end input?' so the input is numeric. Tests preserve quoted and bare punctuation and verify the explicit delimiter; no parser rule was weakened.

## Kokoro investigation

The configured local speech endpoint refused a connection during a read-only probe. Auto-start is enabled and the configured Python executable and launcher exist. This does not identify why the original server missed its 15-second readiness deadline, or prove it is currently meant to be running.

A confirmed lifecycle defect was fixed: the cached startup promise could survive an exited child and prevent a real restart. Settled startup attempts are now cleared; exit/error handlers only clear state when they belong to the current child, preventing a late event from an old child from hiding a new process. Mocked tests cover installation failure, repeated start without duplicate children, child exit, spawn error and stale events after restart.

No actual Kokoro process was started, no audio was generated, no packages/models were downloaded, and no settings were changed. Speech readiness/playback still needs observation after the user's normal backend restart. If the timeout remains, collect the Kokoro startup lines preceding it, including any Python traceback.

## Verification and next step

All **127/127 offline test files passed** after the final code changes.

Full offline log: backend/.local/semantic-evaluation/offline-tests-clarification-final-2026-10-10.log. Focused service, conversation, argument-parser and mocked Kokoro tests passed; tracked whitespace checks passed. No commits or production-memory writes.

Restart the ATLAS backend and repeat test 1 in the updated October 8 checklist. It should ask for value and complete normally, without Project question could not complete or a FAILED request. The remaining live tests can follow once that behavior is confirmed.
