# Conditional branch conclusions

## Change

Added branchConclusions.js: a bounded link from an Atlas-derived Boolean condition result to its source if/then/else relationship. It records scenario identity, explicit additional arguments, source condition, selected branch (then, else or fallthrough), source spans and recursive evidence support. These are conditional selections if the guard is reached, not whole-function results or proof of reachability.

Source if facts now explicitly record whether an else exists. Missing else evidence cannot be mistaken for an absent else. Unknown/non-Boolean conditions, clipped facts and incomplete branch structure produce no conclusion.

Development bundle mode supplies branch facts within the existing budget, requests structured branchAssertions, and checks referenced IDs, exact branch choice, duplicates and extra fields. Conflicting assertions withhold model claims/predictions from display and speech, while keeping the deterministic evidence. Missing assertions are incomplete, not matched. Deterministic display prose describes the selected branch and limits; source details are not added to speech.

The validator checks structured assertions only. Arbitrary model prose and returned values remain MODEL_INFERRED even when branch assertions match. This does not solve general prose entailment. Default live routing remains unchanged.

## Validation

102/102 offline test files passed (backend/.local/branch-conclusions-tests.log). After an additional clipped-fact exclusion and malformed-assertion cases, the targeted branch test passed again. Tests use authored source fixtures parsed as data, never executed: trimmed-input if/else, enabled-flag fallthrough, a local length plus Boolean guard, unknown arguments/calls, non-Boolean guards, incomplete else evidence, recursively citable support and service-level conflict withholding.

Three sequential local-model probes used different small authored functions rather than the percentage and character-count regressions. Results: backend/.local/branch-conclusions-audit/1790218114264.json. All three structured branch assertions matched; manual review found their branch explanations correct. Their return-value claims were also consistent with these simple source fixtures, but were not independently certified by the branch validator. This is a small development evaluation, not broad model reliability evidence; no paired baseline was run.

No source execution by the analyzer, production writes, migrations, global model changes or commits.

## Next checkpoint

The next useful step is a narrow end-to-end opt-in path with explicit scenario/target resolution, unknown-input handling and a small held-out conversation evaluation. Do not expand this into a general interpreter or keep tuning the same prompts. Spoken live testing should wait until that path is reachable through the actual conversation pipeline. Current experimental entry points still require explicit development arguments; no user live rerun requested in this pass.
