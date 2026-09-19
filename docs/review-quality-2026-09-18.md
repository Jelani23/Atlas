# Review usefulness and explanation depth

## Implemented

- Reviews generate independent behavior-test suggestions, not only regression tests attached to accepted bugs. Rejected/withdrawn findings do not erase valid test suggestions.
- Each suggestion needs setup, action/input, predicted outcome, and a source quote. The internal draft uses a bounded JSON schema. The checks still validate the returned data; format compliance is not correctness.
- Wrong test-citation line numbers can be relocated only when the verbatim quote uniquely matches the same inspected file. The displayed citation identifies this correction. No fuzzy matching or cross-file substitution; defect citations retain strict matching.
- Suggested outcomes remain labeled model predictions, not verified behavior. Nothing generates or executes arbitrary test programs. Clean reviews need only one model call.
- Source-backed conversational explanations receive guidance to distinguish early returns, branch preconditions, cache origins and failed reads versus absent data.

## Live observations

The coder initially omitted citations, then produced off-by-one line references. After structural constraints and exact-quote location resolution, the agentProfiles review produced three visible test suggestions in one call. They remain weak: test purposes describe cache freshness while some inputs actually cover ID validation or successful loading; setups do not consistently explain how to prime/control the cache. This is improved usefulness, not a quality sign-off.

The general-model comparison produced some usable suggestions but also invented race/whitespace-validation defects. Its second pass withdrew or left those unresolved. No production model switch was made.

Six new depth probes cover early return, exact TTL boundaries, cache origin, shallow copying, empty-array counterexamples, and useful tests without a defect. Independent fixed-code oracle tests verify the expected JavaScript behavior. No model-generated code is executed.

Initial coder run: keyword smoke score 3/6. Manual review found worse semantic quality than this suggests: the shallow-copy explanation contradicted its own test; the origin explanation conflated new snapshot identity with profile reuse; the early-return answer invented a defect. The empty-array counterexample was substantially correct despite a keyword failure.

A tighter/shorter analysis instruction experiment raised the smoke score to 5/6 but **did not improve semantic quality**: it inverted all three TTL outcomes, claimed spread clones nested objects, and supplied a non-counterexample to the nonempty-array claim. The experiment was reverted. More words, faster replies and matching keywords are not evidence of deeper reasoning.

Raw probe reports (local, untracked):
- `.local/internal-understanding-audits/1789769563388-coder-analysis.json`
- `.local/internal-understanding-audits/1789769705097-coder-analysis.json`

## Next evaluation protocol

Use the same source and input cases for general vs coder, ordinary explanation vs analysis. Keep native-thinking and token budgets explicit and do not promote a configuration from keyword scores alone. Evaluate:

1. Correct branch and preconditions.
2. Exact output/exception and language semantics.
3. Explanation/test consistency.
4. Useful reproducible test setup and observable assertions.
5. Respect for missing evidence and execution boundaries.

Score each 0–2, but any inverted result, fabricated guard or contradictory test is a semantic failure regardless of the total. Record elapsed time and truncation separately. Add multi-turn corrections and cross-file dependency cases after single-file basics are reliable. Do not infer private thinking depth from visible verbosity.

User acceptance remains focused on whether a no-defect review supplies useful tests. Broad reasoning reliability remains open; no extra migration or commit was performed.
