# Focused analysis: accuracy gate

## Change

Added `reasoning/focusedAnalysis.js`: resolves a unique function with the existing syntax extractor, supplies its numbered source excerpt and enclosing function setup, and asks for one concrete scenario result plus explanation and citations. Full-map truncation, ambiguous functions and unusable source are rejected. Replies have a 700-token allowance, 8192 context, temperature 0, native thinking off, and 45-second cancellation-aware deadline. It executes no source or generated tests.

This module is **not connected to normal learning or conversation**. The accuracy gate below failed; no runtime/model policy was changed and no stored production knowledge was modified. The current database-backed pipeline remains available, with its existing unverified status.

The fixture `tests/fixtures/focusedProfileCases.js` independently executes authored checks over the real profile store with injected clock, client and seed data. It tests missing profile fields, a syntactically valid unknown ID, fresh cache, exact TTL expiry and seed-cache expiry. These expected answers are retained only in audit reports, not fed to the model. No production database client is used.

Reproduction from backend:

```text
node tests/focusedAnalysis.test.js
node scripts/auditFocusedAnalysis.js
node scripts/auditFocusedAnalysis.js --general
```

The script preserves source/version, scenarios, executed oracle results, actual prompts, raw answers, visible results, citations, model and durations. Exit success indicates structural completion, never semantic correctness. The final runner uses focused excerpts; the full-file prompt versions from the first two experiments are retained in their reports.

## Results: fifteen sequential model requests

All five scenarios were drawn from known failures rather than held-out generalization tests. This is a diagnostic comparison, not a model ranking.

| Run | Report under backend/.local/focused-analysis-audits | Manual findings |
| --- | --- | --- |
| Coder, function focus but whole file supplied | `1790117456141.json` | Correct incomplete-profile result. Correct unknown-agent error but false explanation that `invalid` fails the regex. Fresh-cache result contradicted its explanation. Wrong expired database-cache and seed-cache outcomes. |
| General, same scenarios and whole file | `1790117514252.json` | Confused validation error branches; claimed lowercase `invalid` starts uppercase; described an immediate fresh-cache return but assigned degraded cached-database fields. Final seed case exhausted 700 tokens and could not be parsed. No justified replacement of the coder. |
| Coder, reduced function excerpt with enclosing setup | `1790117610561.json` | Correct incomplete-profile result. Unknown-agent error again accompanied by false regex explanation. Predicted errors for all three cache scenarios, ignoring stated cache/seed conditions. Narrowing source did not fix the reasoning. |

Exact fixed outcomes:

- Incomplete object: throws `Invalid agent profile shape`.
- `get('invalid')`, no cache/seeds, database error: throws `Profile unavailable for agent invalid; refusing to substitute another agent`. The ID passes syntax validation.
- Cached database revision 7, age 29999, TTL 30000: source `database`, degraded false, revision 7, **zero database calls during the second get**.
- Same cache at age 30000, failed refresh: source `cached_database`, degraded true, revision 7, one database call.
- Seed-origin cache at age 30000, failed refresh: source `seed_fallback`, degraded true, revision null, one database call.

Matching an error string while explaining the wrong branch is not a semantic pass. Line-number citations in this focused path are checked for existence and displayed with actual source text; their presence does not prove they support the explanation.

## Validation and decision

93/93 offline files passed; targeted focused tests passed again after the excerpt assertion. The tests cover actual fixed oracles, retained enclosing state, exclusion of unrelated functions, function selection, source citations, timeouts and cancellation. No new migration or live acceptance loop is needed for this evaluation-only change. No commits made.

Do not enable the focused path simply because it produces shorter responses. This evaluation found state propagation and guard-order errors in both models even with explicit scenarios. The next justified implementation is an evidence-checking stage: run approved fixed behavioral checks, retain their actual results separately, and ask the model to explain those observations while flagging contradictions. It must label the limited tested scope and avoid promoting unrelated claims. Developing that stage is distinct from executing model-generated programs or declaring entire summaries verified.
