# Semantic evaluation continuation — September 10

> Historical evaluation log. The September 11 continuation at the end supersedes earlier results; `memory-workflow-status.md` is the active handoff.

## Recovered state

Yesterday's implementation was present in commit `e697149`; the working tree was clean. Migration 011/012 and SQL assertion success were documented and confirmed by the user in conversation. Cache consistency and verification ownership protections were present. All 38 prior targeted local test files passed again. No missing-transcript cause was established.

## New evidence and delivered change

Added 14 synthetic challenge cases before the first live run. They cover polarity, signed quantities, platform sets, database paraphrases, hypothetical changes, historical versions, versions of different components, versioned procedures, explicit release replacement, requirements versus implementation, related entities, different properties, case-sensitive units, and an exact duplicate among conflicting candidates. These fixtures are now observed development cases, not blind holdouts.

The version-conflict shortcut incorrectly assigned conflict with confidence 1 before semantic property/time/procedure scope comparison. It also selected a conflicting candidate before an exact duplicate. Removed that shortcut and its unused export. Exact duplicates remain fast; other comparisons use the existing model comparison and conservative validation. No merge thresholds or verification requirements were relaxed.

A general prompt sentence distinguishing requirements/proposals from actual implementation was trialed, but it did not fix the target case and regressed a platform case. The prompt change was reverted. No challenge examples were copied into prompts.

## Live local qwen3:4b results

| Run | Correct | Unsafe equivalent/update decisions | Candidate misses | Model errors |
|---|---:|---:|---:|---:|
| New challenge set, before change | 8/14 | 0 | 0 | 0 |
| Challenge set, version shortcut removed | 13/14 | 0 | 0 | 0 |
| All suites, trial scope prompt | 36/42 | 0 | 0 | 0 |
| All suites, final code with original prompt | 37/42 | 0 | 0 | 0 |

Final breakdown: original suite 15/18; September 8 additional cases 9/10; new challenge suite 13/14. These are small synthetic evaluations, not proof of production-wide safety or complete semantic accuracy. The unchanged original prompt still produces errors and the comparison model should not be granted broader automatic overwrite authority.

Final failures:

- Original negative offline-support assertion: distinct instead of conflict.
- Original platform restriction: distinct instead of conflict.
- Original weak database/storage paraphrase: distinct instead of equivalent.
- Earlier proposed hosting change: conflict instead of distinct.
- New retention requirement versus actual retention: conflict instead of distinct.

The five new version/ordering regressions all pass. They also have deterministic orchestration tests proving that differing versions reach comparison and exact duplicates are selected first. All 39 targeted local test files passed; focused tests passed again after reverting the prompt. The live evaluation deliberately returns nonzero when expected decisions fail.

Private reports under `backend/.local/canonicalization-evaluations/`:

- `1789053309517.json`: challenge baseline.
- `1789053389906.json`: challenge after shortcut removal.
- `1789053499329.json`: all suites with trial prompt.
- `1789053621462.json`: final all-suite run.

## Next

Evaluate assertion status and property/scope comparison as structured dimensions instead of accumulating phrase exceptions. Add new, independently varied evaluation cases before modifying comparison behavior further. Legacy cleanup, interrupted-verification recovery, safe resolution undo, and full end-to-end acceptance remain open; see `memory-workflow-status.md`.

No production memories were loaded or written by these synthetic evaluations, no migrations were added, and no manual user test or SQL rerun is required for this pass.

## Recovery from the unfinished assertion experiment

The local Coding session contains later messages and tool results through 15:33 UTC, even though the app history reader returned older turns. The last user instruction was to continue this semantic/canonicalization phase before discussing the broader ideas. The task ended without a final message or updated handoff for that pass.

Eight frozen assertion fixtures were added before experimenting. Private reports record:

| Configuration | Correct | Report |
|---|---:|---|
| Original comparison, assertion cases only | 4/8 | `1789053853421.json` |
| Assertion fields integrated into main comparison (reverted) | 37/50 | `1789054051542.json` |
| Separate assertion check (left enabled by unfinished pass) | 28/50 | `1789054266299.json` |
| Recovered default path, assertion check disabled | 40/50 | `1789073431056.json` |

All reports are in `backend/.local/canonicalization-evaluations/`. The second check sometimes labeled ordinary facts as proposals or uncertainty and rejected legitimate conflicts and updates. It is now opt-in for synthetic evaluation only:

```powershell
# From backend; uses only synthetic fixtures and local Ollama.
node scripts/evaluateMemoryCanonicalization.js --suite all --live
# Research comparison, not the normal ingestion configuration:
node scripts/evaluateMemoryCanonicalization.js --suite all --live --experimental-assertion-check
```

The latest run used qwen3:4b and made 47 model requests for 47 semantic comparisons. Three cases took deterministic paths. Reports now distinguish comparison invocations (`modelCalls`) from provider requests (`modelRequests`), and record the experiment flag. Older second-pass reports only counted comparisons, understating the number of provider calls.

Latest failed IDs: `negative_claim`, `platform_scope`, `candidate_selection`, `weak_lexical_alias`, `heldout_proposal`, `challenge_requirement_not_implementation`, `assertion_requirement_actual`, `assertion_hypothesis_actual`, `assertion_completed_transition`, and `assertion_past_proposal`.

The candidate-selection response hit `num_predict=600` and could not be parsed, so it failed closed. The report's zero `errors` means zero thrown evaluator exceptions; it does not mean every model response was valid. The same 42 cases from the earlier checkpoint scored 36/42 in this run. The additional assertion suite scored 4/8. Zero unsafe equivalent/update decisions in a small suite does not prove general safety, and missed conflicts remain important.

Forty selected offline test files passed, including the default/experimental adapter paths, version scope, telemetry, and knowledge ingestion integration. The integration tests simulate model decisions and storage; they prove routing behavior, not live model understanding or PostgreSQL transactions. `git diff --check` passed.

An initial broad test selection also included the older live `memoryAudit.test.js` and `memoryExtractor.procedure.test.js`. The audit failed loading projects from Supabase during setup, and the extractor reported project-load failures. The runner was stopped and replaced by the offline selection; those live checks are not counted as passing. No successful database mutation was reported. Future offline runs must exclude these and `memoryRaceCondition.test.js`; do not infer offline behavior from the `.test.js` suffix.

## September 11 continuation

The retained implementation retries malformed/schema-invalid comparison output once (600 then 1200 output tokens, shared 30-second timeout). Valid uncertainty and disagreements are not retried. Reports distinguish malformed intermediate outputs from final invalid decisions; invalid output cannot count as correct because the expected answer was distinct.

Additional prompt experiments were measured and reverted: a shortened reason scored 34/50 with one unsafe decision (`1789073849287.json`); reason-first plus scope wording scored 38/50 (`1789074063699.json`); a compact prompt scored 31/50 (`1789074600446.json`). Native-thinking output was slow and truncated; that trial stopped without a completed report. None is the normal path.

Latest retained-path report `1789074828437.json`: **40/50**, zero unsafe equivalent/update decisions observed, zero candidate misses, zero thrown errors or invalid model responses, and 47 comparison calls/actual requests. Failures: `negative_claim`, `numeric_sign`, `platform_scope`, `candidate_selection`, `weak_lexical_alias`, `heldout_proposal`, `challenge_requirement_not_implementation`, `assertion_requirement_actual`, `assertion_hypothesis_actual`, `assertion_past_proposal`. Variation across runs remains; this does not establish production-wide safety.

Exact-key knowledge paraphrases now reach semantic comparison rather than going straight to review. Guarded SQL still controls changed-value writes regardless of the model's classification. Tests cover canonical-wording/trust preservation and model-failure fallback to review.

The actual extraction-to-undo lifecycle initially failed before comparison: ordinary uses/stores sentences missed eligibility, and unregistered services could be classified as project memories. September 11 fixes eligibility, removes fallback instructions that discouraged simple facts, and excludes project category from the extraction schema when no project keys are registered. The final synthetic local qwen3:4b/PGlite lifecycle passed (`backend/.local/lifecycle-validations/1789134119175.json`). This is one three-message smoke test, separate from the 50-case comparator evaluation.

All 44 offline memory test files passed, plus the project/procedure audit with 155 assertions (now in the runner for 45 files). Fresh and upgrade PostgreSQL tests cover ingestion, resolution, recovery, undo, stale snapshots, and rollback. Migration 013 still needs the user's Supabase application and SQL acceptance test; earlier sections saying no migration is needed describe only their historical semantic-evaluation passes.
