# Structured consistency and straight-line propagation

## Implemented

`semanticConsistency.js` compares model expression assertions against Atlas-derived typed results. IDs, duplicate assertions, malformed JSON, types and values are validated independently of the generation schema. Mismatched structured assertions withhold model claims/predictions while retaining the deterministic expression-results section. This preserves exact distinctions such as negative zero, NaN and string-array contents.

Statuses are deliberately scoped: `matched` means all supplied semantic facts have matching structured assertions; `incomplete` means some were omitted; `rejected` means a supplied assertion failed validation. None means the free-form explanation or full function outcome is verified. Unsupported prose entailment is not silently treated as checked. Empty assertion lists do not earn verification.

The primitive rule version is now bounded-string-expression-v2. It propagates supported values through unique unwritten single-declaration `const` statements in a direct function-body prefix, retaining source links to the initializer chain. A following direct return can use those values. It stops at branches, loops, try blocks, arbitrary expression statements, unsupported initializers, assignments and mixed declarations. In particular, an array mutation or branch before a later length read cannot reuse a pre-mutation value. This remains bounded analysis, not arbitrary source execution or a whole-function interpreter.

## Validation

101/101 offline test files passed. Added tests cover mismatched types/values, negative zero, arrays, malformed/unknown assertions, retained deterministic results when model claims are withheld, const-chain provenance, and stopping at branching/mutation. Existing bounds, shadowing, source selection and speech tests remain intact.

Regression comparison: `backend/.local/primitive-semantics-audit/1790217485982.json`, produced by auditPrimitiveSemantics.js. Four sequential calls under the same model/budgets, using the previously examined inputs. This is a development regression, not a fresh held-out quality claim. No generated tests or production writes.

With semantic facts, the character-count explanation gave both requested counts correctly (5/2 and 3/3), although the separate prediction entries still reported only the total counts. The percentage explanation copied parseFloat results correctly but invented a zero/invalid total despite the supplied total of 14, then concluded incorrectly that numeric prefixes are rejected. Its structured assertions matched the intermediate parsing results; the later free-form contradiction was outside the validator's scope. Both semantic runs had incomplete assertion coverage and no structured mismatch. Injected mismatch tests, rather than this model run, verify the withholding path.

## Rollout and next work

Live answering remains unchanged; bundle/semantic mode still requires explicit development options. No migration, model-default changes, database changes or commits. No live user test requested.

The remaining gap is turning correct intermediate values into valid branch and outcome reasoning. A next bounded implementation may accept explicitly supplied multi-parameter scenarios and derive selected Boolean guards under known primitive values. It must not infer missing arguments or claim that matched intermediate assertions validate an arbitrary paragraph. Broader evaluation is required before enabling the new pipeline.
