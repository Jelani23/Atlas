# Checked analysis interruption — October 10, 2026

## Observed failure

The live test sent a missing-input command while a supported checked request was running. The second request failed with the global busy guard; the error appeared twice and the first request completed after 36.7 seconds. The prior test instructions incorrectly assumed a dedicated cancel control and then assumed sending a message already cancelled analysis.

## Changes

- Track in-flight turns by actual conversation scope. A new message cancels a pending deep-analysis task and waits for its cleanup before routing. Rapid replacement messages skip superseded queued turns.
- Preserve the selected source and function for the replacement follow-up. The cancelled turn cannot clear that context or emit an answer or speech.
- Allow up to 250 ms for asynchronous transport abort settlement before completing cancellation. A provider that ignores abort retains the exclusive model lock; no overlapping model calls are allowed.
- Suppress a second UI error event when the request failure already has a returned reply. Failures without replies still emit errors.

## Validation

Regression tests exercise new-message interruption, delayed abort rejection, rapid third-message replacement, retained function context, cancelled task status, and absence of old assistant writes, completion events, and speech. Interface tests check duplicate-error suppression and errors without replies. Existing tests cover explicit task cancellation, session closure, and the lock for a provider that ignores abort.

Offline tests use mocked model and memory dependencies. No paid service, model download, production knowledge write, source execution, or commit was needed. This fixes request handling; model reasoning and static-analysis coverage are unchanged.

## Live retest needed

Restart the backend normally. Send:

    Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue with value set to 0

While it is processing, send:

    Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue.

Only the request for a parameter value should appear. Wait about 60 seconds and report any old result or speech, with backend logs. The real local transport and desktop delivery still need this check.

Final verification: 127/127 offline test files passed after the transport cleanup adjustment. Log: backend/.local/semantic-evaluation/offline-tests-interruption-final-2026-10-10.log. git diff --check passed.

## Live confirmation and blank-reply fix

The user confirmed no late answer or speech after interruption. Logs show TASK-0003 cancelled, REQ-0004 aborted=true at 5814 ms, and the replacement clarification completed successfully in 518 ms total (14 ms analysis). The UI still appended an empty Alice message for the cancelled request's empty reply.

The renderer now ignores results from superseded submissions before changing messages, typing state, or timers. Successful empty replies also do not create chat bubbles. Renderer TypeScript validation passed with --noEmit --incremental false. The remaining visual check is that repeating interruption no longer leaves an empty bubble.
