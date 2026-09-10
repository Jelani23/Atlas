# Live canonicalization evaluation — 2026-09-08

## Scope

Evaluated the configured local `qwen3:4b` through Atlas's canonicalizer using 18 synthetic cases. No production records were loaded, updated, merged, or reverified. This evaluates identity resolution, not the full extraction/upsert workflow or world-fact verification.

The suite covers exact duplicates, paraphrases, quantities, polarity, units, signs, properties, entity variants, missing qualifiers, composite claims, platform scope, historical scope, explicit project updates, project boundaries, user preferences, procedure triggers, and selection among multiple candidates.

## Results

| Run | Exact expected decisions | Unsafe matches | Candidate misses | Model errors |
|---|---:|---:|---:|---:|
| Initial | 10 / 18 | 6 | 0 | 0 |
| With conservative vetoes | 12 / 18 | 0 | 0 | 0 |

An unsafe match here means an incorrect equivalent/update decision or wrong target relative to the fixture. Zero in this small suite is not a guarantee for arbitrary inputs. Both live runs correctly return a failing exit status because not every expected decision passed.

The remaining six failures are five contradictions returned as distinct and one valid database/storage paraphrase returned as distinct. The expected candidates were retrieved in every applicable case, so these failures lie in classification or conservative rejection, not retrieval. Model confidence was high even for wrong initial decisions.

Private full reports (ignored by Git):

- `backend/.local/canonicalization-evaluations/1788898589203.json`
- `backend/.local/canonicalization-evaluations/1788898714320.json`

## Changes

- Added a preview-by-default evaluation command with per-case raw decisions, expected/actual targets, candidate recall, timing, errors, and unsafe-match counts. Live mode is local-Ollama-only and uses 30-second request deadlines.
- Added `memoryEquivalencePolicy.js` to veto equivalence when numeric/unit anchors, polarity markers, restriction markers, or procedure trigger/action fields differ. These are conservative structural checks, not a replacement semantic classifier and not judgments that either claim is false.
- Added rejection when only one subject has explicit version/model qualifiers. Missing qualifiers are uncertainty, not evidence of entity identity.
- Added optional abort-signal forwarding to non-streaming Ollama requests; ordinary requests retain their previous behavior when no signal is supplied.
- All 21 targeted local test files passed, including the evaluator, safeguards, existing canonicalization, retrieval, verification, cleanup, and Ollama payload tests.

## Run again

From `backend`:

```powershell
npm run memory:canonical-eval
npm run memory:canonical-eval -- --live
```

The first command lists cases without model calls. The second uses the configured local model and saves a timestamped private report. It does not load production memories. No SQL migration is needed.

## Remaining work

Improve classifier handling of conflicting values versus distinct properties and equivalent property names, using held-out examples rather than only tuning these cases. Consider a structured evidence comparison before expanding automatic merges. Explicit update authorization, lexical candidate recall on broader data, exact-identity upsert behavior, and persisted review/conflict workflows still need their own evaluations. Current conservative rejections can cause separate records rather than a recognized conflict; they prevent the tested merges but do not solve duplicate accumulation.

No manual user test or database cleanup is required for this checkpoint. The 19 ambiguous topic records and record 66 decomposition remain under review.

## Follow-up: structured comparison

Replaced the single relationship-classification prompt with `memoryIdentityComparison.js`. The model compares entity, property, scope, and value agreement separately. Code derives equivalent/conflict/update/distinct from those dimensions and still applies the existing canonicalizer safeguards. Updates require an exact passage in the incoming value describing replacement; this check ensures the passage exists, not that every interpretation of it is correct.

Storage category names are omitted from comparison data: the incoming bank label `knowledge` and a stored domain label such as `technology` are different field meanings, not different entities. Subject/property labels are displayed with underscores converted to spaces; stored identities are unchanged. Full candidate values are supplied rather than silently clipping decisive content at 320 characters. The obsolete prompt/schema were removed from the canonicalizer, keeping comparison logic in its own module.

Procedure trigger/action differences now block all same-identity relationships, including conflict and update, rather than just equivalent. This is deliberately conservative about differently worded procedure rules.

Added 10 fixed additional cases in `canonicalizationHeldOutCases.js` before testing the new comparison. They cover a different domain, preferences, proposals versus current state, explicit updates, historical context, and procedure boundaries. They were subsequently observed during development, so future validation should use another untouched set rather than claiming these remain blind holdouts.

| Structured comparison run | Original 18 | Additional 10 | Total | Unsafe equivalent/update suggestions |
|---|---:|---:|---:|---:|
| Initial dimension prompt | 11 / 18 | 8 / 10 | 19 / 28 | 0 |
| Readable labels and comparison examples | 15 / 18 | 8 / 10 | 23 / 28 | 0 |
| Final pass, replacement example and procedure boundary guard | 14 / 18 | 9 / 10 | 23 / 28 | 0 |

The final original-suite result improved from the preceding 12/18 checkpoint to 14/18. The different failures across prompt variants show sensitivity, not monotonic improvement. Do not relax safeguards or claim general semantic reliability from these results.

Final remaining failures:

- Opposite offline-support claims, signed temperature values, and platform restrictions were classified as distinct rather than conflict.
- A valid storage-engine/database-backend paraphrase was missed.
- A proposed hosting change was treated as a conflict with current hosting rather than a distinct proposal.

No candidate misses or model-call errors occurred in the final run. No production records were touched. A conflict decision is non-overwriting here, but incorrect conflict labels remain failures, even though they are not counted in the unsafe equivalent/update metric.

Full reports:

- Initial structured run: `backend/.local/canonicalization-evaluations/1788899501367.json`
- Intermediate run: `backend/.local/canonicalization-evaluations/1788899647761.json`
- Final run: `backend/.local/canonicalization-evaluations/1788899772534.json`

All 23 targeted local test files passed, including new comparison-schema/mapping tests and a mocked test of the full model-comparison path through the canonicalizer. Use `npm run memory:canonical-eval -- --live --suite all` to repeat the expanded suite, or `--suite heldout` for only the additional cases. Preview still makes no model calls. The final live run exits nonzero because five expected decisions remain wrong.

Next: assess more reliable property/scope comparison using another untouched evaluation set before broadening automatic merges; separately evaluate the exact-identity upsert path and durable conflict/review handling. No SQL or manual user test is required for this pass.
