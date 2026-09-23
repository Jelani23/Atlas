# Review quality: bounded evaluation checkpoint

This change adds an evaluation runner and two authored fixtures only. No runtime prompt, model policy, migration, production data or generated-code execution changes. Base commit: `aa78073`. No commits made.

## Method and reproduction

From `backend`:

```text
node scripts/auditReviewQuality.js --dry-run
node scripts/auditReviewQuality.js
node scripts/auditReviewQuality.js --case=label-defaults --mode=casual
```

Modes are `casual`, `analysis`, or `both` (default). Optional `--max-tokens=900` sets the same per-call allowance for both modes (maximum 2400). Requests are sequential, temperature 0, thinking off, context 8192, and deadline 45 seconds per call. At most two model calls per turn; model failures stop the batch after preserving the report. This is an audit-only budget override. Production budgets/defaults are untouched.

Each fixture runs in a fresh session in each mode: read source, explain branches, ask a boundary follow-up, then request review/tests. Generated answers carry forward in in-memory history. The real resolver, planner, evidence retention, context builder, conversation engine, response processor and validated review are exercised. Tool execution returns an authored numbered source fixture; retrieval, persona loading, session storage, jobs and speech are replaced. Database access and non-local fetches are blocked. Only the expected fixture read is allowed. This is not a full live-app test, a real source-reader test, or a memory-retrieval evaluation.

The source comes from fixed JavaScript functions in `backend/tests/fixtures/reviewQualityCases.js`. Their independently asserted outputs are recorded beside the transcript and are never sent to the model. No model-authored program is evaluated. The two examples were new relative to the previous audit fixtures; after this run they are regression examples, not an untouched future holdout.

The report retains exact source/version, prompts, raw and visible responses, model selection, call duration, provider metrics, oracle outputs and human rubric. Exit success means the run completed and its routing/evidence assertions passed, not that model answers were correct. `manualReview: null` intentionally requires separate human adjudication; the first adjudication is recorded below. No keyword or answer-length quality score is used.

## First run and manual adjudication

Local report: `backend/.local/review-quality-audits/1790113022972.json` (excluded from version control).

Four conversations, sixteen turns including four deterministic reads, twelve sequential model calls. All calls ended with `doneReason: stop`; no output-budget exhaustion or timeout. Ordinary explanations selected `qwen3.5:4b`; analysis explanations and all explicit reviews selected `qwen2.5-coder:7b`. This compares deployed paths, not analysis instructions independently of model choice. Both review requests use the same validated-review workflow, so their matching outputs are not independent evidence of mode superiority.

| Case/path | Explanation accuracy | Review usefulness |
| --- | --- | --- |
| Default arguments / ordinary | Initial requested examples correct, but incorrectly says the trim branch requires a nonempty string. Follow-up incorrectly predicts `chooseLabel(null, undefined)` returns undefined. | Three concrete, correct basic tests; misses empty-string fallback, explicit undefined fallback and trimming behavior. |
| Default arguments / analysis | Initial examples correct, but type-guard precondition omits the preceding null exclusion. Follow-up rewrites the function signatures instead of applying arguments to the supplied function; wrongly predicts undefined for both omitted and explicit undefined fallback. Its invented unbound fallback would actually throw ReferenceError. | Same basic tests and omissions as ordinary path. Longer explanation does not repair the semantics. |
| Queue mutation / ordinary | Correct return values, mutations and guard ordering for limits 2, 0, 8 and 1.5. | Correct string-limit rejection, negative-limit rejection and ordinary success tests. No explicit assertion of original-array mutation or unchanged array on rejection; zero and oversized boundaries omitted. |
| Queue mutation / analysis | Concrete outputs and mutations correct for all asked limits. Prose incorrectly describes remaining elements as returned, although its example correctly returns the count; one precondition sentence calls 1.5 an integer before contradicting itself. | Same test suggestions as ordinary path; useful basics but incomplete boundary and mutation coverage. |

The fixed oracle confirms omitted and explicit undefined fallback both return `untitled`; an explicit empty string returns an empty string. For queue consumption, limit 0 preserves the array, limit 8 consumes all three items, and limit 1.5 throws before mutation. No defect is established under either fixture's stated contract. All reviews correctly avoided inventing a defect and supplied concrete tests, but none fully met the usefulness rubric.

The validated-review prompts contain current request and retained source, not the preceding explanation conversation. Inspection of both code and saved prompts confirms this boundary. The earlier edge-case discussion therefore does not reach review automatically. That may contribute to missed conversational priorities, but this run does not prove that adding history would improve correctness. It could also propagate the erroneous prior explanation. Treat any source-grounded carryover change as a separate bounded decision, not an automatic patch.

## Validation and next gate

- Dry run: all four conversations completed; source reached every model-bound follow-up, with no follow-up tool execution.
- Fixed fixture oracles passed in dry and live runs.
- Existing `sourceConversationRouting.test.js` and `validatedAnalysis.test.js` passed.
- New files pass JavaScript syntax checks and whitespace checks.
- The earlier 89-file suite and 24 routing-boundary checks were not rerun for this evaluation-only change.

No model or thinking policy change is justified. Next evaluation should use fresh cases and distinguish a source-grounded review focus from assistant-authored behavioral claims before testing any carryover proposal.

Live acceptance in Alice, in order (these inspect existing Atlas source, not the synthetic audit file):

1. `Read the code for src/agents/agentProfiles.js lines 1-80.`
2. `Based on that code, compare a failed refresh after a database-backed cache, after a seed fallback, and for an unknown agent with no cache. Explain the TTL precondition too.`
3. `Review that code and suggest three concrete tests covering those cache origins. Include clock setup, database mock result, and exact expected source/degraded fields or error. Do not run or save anything.`

Expected: a fresh cache returns before attempting a database read; advance beyond the TTL to test refresh failures. Database-origin cache becomes `cached_database` with `degraded: true`; Alice's seed-origin cache remains `seed_fallback` with `degraded: true`; unknown agent without a seed/cache throws. Tests must establish distinct cache origins, rather than vaguely saying “mock a cached profile.” The live prompts are an acceptance probe, not a claim these semantics are now reliable.
