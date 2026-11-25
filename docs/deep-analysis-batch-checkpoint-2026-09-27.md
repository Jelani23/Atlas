# Deep-analysis follow-up fixes and live test batch

Latest results and repairs: [live failure recovery checkpoint](deep-analysis-live-failures-2026-09-27.md). The prompts below remain the reference batch; only pairs A and C currently need repeating.

## Changes

The user's live keyword analysis routed correctly but predicted two tokens for `Test...123`, despite describing deletion of punctuation. It also requested runtime inputs and Unicode documentation to explain behavior already specified by the source. Successful request logs and valid citations did not establish semantic correctness.

- Contract version 3 removes `analyzer_limit` from model-proposed unknowns. Atlas still reports its actual analyzer limitations separately. Every proposed missing-source/runtime unknown must include a specific `blockedConclusion` and `neededEvidence`. Empty unknowns remain valid. Structural validation enforces these fields and categories; it cannot establish whether a proposed unknown is justified.
- Instructions now ask for concise, ordered source reasoning in each example: decisive guard, intermediate transformations, filtering, result or escaping exception. They explicitly distinguish deletion from separator replacement, general behavior from actual runtime state, and function limitations from analyzer limitations. This is an unverified model-quality intervention, not a semantic checker.
- Answers lead with model interpretations. Host evidence notes follow examples and open questions. Follow-ups summarize analyzer-limit counts while continuing to show actual recorded source gaps and omissions. Full diagnostics remain in the returned packet. Speech labels proposed questions as unverified.
- The authored keyword audit now includes the exact `Test...123` regression. No model-generated code is executed, and no project source is automatically patched.

## Verification and boundaries

Reference outputs below were obtained from fixed calls to the inspected pure utilities. The three initial commands were checked through the real detector and select deep mode with the intended paths. Contract/service tests cover the new unknown fields, rejection of model analyzer-limit categories, presentation order, retained gap notices and speech uncertainty. Existing response/channel guards remain in effect.

The complete network-disabled offline suite passed: **118/118 test files**, with no failures.

No new local-model call has been made for this change. Live semantic effectiveness and final speech quality remain unverified. The pipeline still cannot reliably reject arbitrary false prose or inconsistent predictions. No production memory writes, background learning, migrations or commits were performed; existing uncommitted work was preserved.

## Live batch

Restart the backend. Use a fresh conversation for each pair, and wait for each answer before sending the next prompt. Paste only the prompts, not the expected results. Preserve the full responses and timing/error logs for review.

### Pair A: transformations, return type and errors

1. `Deep analyze src/utils/keywordExtractor.js function extractKeywords.`
2. `What does that function return for "Test...123", "café déjà vu", a string containing three spaces, null, 0, and numeric 7? List Set elements in order or name the escaping error. Explain the decisive operations for each input. Does punctuation create a word boundary?`

Expected in order: Set containing `test123`; Set containing `caf`; empty Set; empty Set; empty Set; escaping `TypeError`. Punctuation is deleted, so it can join text. Whitespace-only input reaches processing; it does not take the initial falsy return. Numeric 7 reaches `.toLowerCase()` and fails. No invocation trace or Unicode documentation is necessary for these predictions under standard built-in behavior.

### Pair B: branch order and what a name does not prove

3. `Deep analyze src/utils/searchEvidence.js function hasVerifiedSearchEvidence.`
4. `What does that function return for "SEARCH_STATUS: RESULTS_FOUND SEARCH_STATUS: NO_RESULTS", "SEARCH_STATUS: RESULTS_FOUND error: failed", "This is fabricated text long enough to pass.", and "short"? Explain which branch decides each result. Does true prove the text is independently verified web evidence?`

Expected: `false`, `true`, `true`, `false`. NO_RESULTS takes priority; RESULTS_FOUND returns before fallback checks; a sufficiently long unmarked string can pass the fallback; a short string fails it. A true return does not establish independent verification.

### Pair C: early returns and exact loop bounds

5. `Deep analyze src/response/recovery.js function getRecoveryAppend.`
6. `What does that function return for argument pairs ["abc","bcXYZ"], ["abcdefghij","ijXYZ"], ["abcdefgh","abcdefghXYZ"], ["","done"], and [0,false]? Explain which overlap sizes are tried and when the loop is skipped.`

Expected: `"bcXYZ"`, `"ijXYZ"`, `"XYZ"`, `"done"`, `""`. First pair tries only size 3, missing its size-2 overlap. Second pair starts at size 5 below the minimum 8, so the loop never runs. Third pair matches at size 8. Fourth and fifth return before the loop; `0` and `false` become empty strings through the `|| ''` expressions.

## How to judge the batch

- Check exact values AND the explanation. A correct value with a contradictory branch or transformation explanation still fails semantic review.
- Check initial and follow-up paths/targets, experimental labels, citations, and whether the narrow answer precedes evidence notes.
- Generic requests for tests, runtime inputs or documentation are not valid blockers for these questions. Actual runtime history would require different evidence, but these prompts ask about supplied hypothetical inputs.
- Check screen output for drafting or channel-control fragments and listen for an intelligible spoken summary. Stop the batch and capture any such failure; do not treat completion metadata as a semantic pass.
- The JSON extractor remains blocked by the known local-provider channel-tag limitation. Repeating that case adds no coverage to this batch.
