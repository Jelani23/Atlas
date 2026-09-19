# Analysis patch: development checkpoint

## Commit scope

This is a bounded source-inspection and review-workflow checkpoint, not a release claim that Alice performs reliable autonomous code review.

- Numbered range reads, coverage/version metadata, dependent continuation, source path restrictions and output limits.
- Explicit read routing; conversational explanations no longer become reads merely because they mention a database read. Real resolver/planner/engine regression coverage complements mocked unit tests.
- Session/agent-scoped source evidence and opt-in code review.
- Structured candidate validation and independent test suggestions; exact source citations, explicit predictions, no autonomous generated-code execution or patch application.
- Explicitly authorized, allowlisted offline regression checks with permission checks, cancellation and version validation. No automatic broad npm test execution.
- Local model audit scripts, fixed expected-behavior oracles and honest records of semantic failures.

## Final hardening

- Retained source evidence now truncates at line boundaries, never mid-line. This prevents a partial line from masquerading as complete syntax/citation evidence.
- Model-call failures preserve actual parser/test results. Failed counterevidence review withholds findings while retaining independently validated test suggestions.
- Each model call has a 45-second deadline and cancellable wait, even if a provider ignores the abort signal. No retry loop was added.
- Analyze-and-save verifies the note tool's success result and reports its actual saved filename; permission or write failure cannot become a success message.

## Deliberate limitations

The coder still makes incorrect predictions and produces weak test setups. Source matching is not semantic verification. Neither longer answers, schema compliance nor keyword audit scores establish correctness. The general-model comparison did not justify changing the default. Native thinking defaults are unchanged.

Controlled checks currently cover four registered source files. Unknown files are skipped explicitly. These are trusted repository tests, not an OS sandbox for arbitrary code. Generated tests are never run. Legacy directory previews cannot produce versioned source findings. The older code-proposal export mismatch is not fixed by this patch and remains unsupported.

## Commit guidance

Final validation: 89/89 offline test files and 24/24 routing-boundary checks passed. Targeted failure-path tests also passed after the final save-message adjustment. `git diff --check` reported no whitespace errors (only Windows line-ending notices).

Include the changed source, offline test runner, new regression tests/fixtures, audit scripts and checkpoint documents together. Do not include `.local` probe outputs, credentials, model files or runtime databases. No migration is required. No files have been staged or committed by the assistant.

The earlier user live test passed read → continuation → explanation → review routing. Final hardening is covered by offline integration and failure-path tests; this is appropriate for a development checkpoint, not a semantic-quality sign-off. Broader model-quality evaluation should proceed as a separate follow-up so speculative prompt/model experiments do not keep expanding this patch.
