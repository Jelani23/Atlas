# Static call bindings and guard-return relations

## Implemented

`staticRelations.js` adds a conservative analysis pass to source bundle version 2. It derives two named relation types, each retaining source spans and supporting fact IDs:

- `unique-unwritten-top-level-call-binding`: connects a call identifier to a unique, unwritten top-level function declaration or const function/arrow, including a const destructured CommonJS import and an unambiguous plain `module.exports` object in an included dependency. Import/export aliases are supported. This is a static binding, not proof of runtime invocation or module initialization.
- `direct-guard-return-skips-later-statements`: for a direct function-body if statement without else whose branch is exactly a return, establishes that a truthy condition followed by that return completing prevents reaching later function-body statements. It does not determine the predicate for concrete inputs, and does not claim a general control-flow graph.

Rules produce STATICALLY_DERIVED facts, not model-authored confidence labels. Model explanations referencing these facts still remain MODEL_INFERRED. Unsupported references stay unresolved in the coverage description. Relation insertion respects the existing bundle budget; skipped relations create a coverage gap.

Conservative exclusions include any same-name declaration elsewhere, assignment/destructuring assignment/update of the binding, direct eval/with, dynamic or mixed module export patterns, spread exports, unknown export names and uninspected dependencies. These can exclude legitimate links; false negatives are preferable to claiming unsupported resolution. ESM bindings, namespace/member dispatch, general aliases and runtime mutation analysis are not implemented. The fallback dependency map contains declarations only, so deeper relations may be unavailable.

The actual unit-conversion bundle now links its normalizeArithmeticExpression call to the function declaration in arithmeticExpression.js and contains the line-9 guard-return relation. This verifies source relationships only; it does not certify the result for an input string.

## Validation

97/97 offline test files passed. New tests cover imported/exported aliases, direct same-file calls, source-backed relation IDs, model-inferred claim status, parameter/named-function shadowing, simple and destructured reassignment, eval, dynamic/spread exports, missing exports, nested-return isolation and the real source integration. Diff whitespace check passed.

The existing sequential six-call comparison was rerun as a regression check, not a fresh held-out evaluation: `backend/.local/source-bundle-audit/1790194107024.json`. All model calls returned, but the bundle conversion answer failed evidence-reference validation and was withheld. Both direct and bundle answers still predicted the wrong empty-string word count; both got tab character counts right. No filename-specific corrections were added. The rejected response is not proof of semantic improvement; this report records the validation failure without inferring the omitted response's correctness.

## Rollout and next scope

Live question behavior remains unchanged. The bundle path is still selected explicitly by development callers using `evidenceBundle:true`. No migration, database writes, generated-test execution, model-default changes or commits.

Next implementation should improve coverage-aware evidence selection and structured claim validation before another broad model comparison. The current facts express code relationships but do not mechanically evaluate JavaScript expressions. Do not turn the observed word-count failure into a special-case prompt or imply that AST extraction alone resolves it. No live acceptance prompts are needed for this development-only change.
