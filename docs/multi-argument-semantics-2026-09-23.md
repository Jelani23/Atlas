# Explicit scenarios and bounded condition evaluation

## Implemented

Primitive rule version bounded-primitive-expression-v3 accepts an optional `arguments` object alongside each existing `{inputId, parameter}` binding. The primary argument still comes from the exact JSON string in the question. Additional arguments are explicitly supplied bounded strings, finite numbers or booleans; unknown parameter names, duplicate primary bindings, objects and nonfinite numbers are rejected. No missing argument is inferred from prose. Recorded facts and the on-screen expression section retain the additional arguments.

The evaluator now supports primitive Boolean literals, negation, strict equality/inequality, short-circuit AND/OR, and unshadowed global isNaN for supported primitives. Number/parseFloat accept the supported primitive argument types. Missing values remain unknown. Single-const propagation may enter an initial try body, and reaches the first if predicate; it does not propagate through either branch, catch or finally. The try-body results remain conditional on reaching the expression with the stated arguments and ordinary intrinsics. They do not establish whole-function outcomes.

No source callbacks, generated tests or analyzed modules are executed by these rules. Existing budget limits, source provenance, shadowing/write exclusions and default live routing remain in place.

## Verification

101/101 offline test files passed (backend/.local/primitive-v3-tests.log). New assertions cover two-argument guard results, zero totals, missing arguments, provenance, malformed bindings, shadowed isNaN, parameter writes, arbitrary-call boundaries and Boolean short-circuit behavior. Diff whitespace checks passed.

Four sequential local model calls: backend/.local/primitive-semantics-audit/1790217874857.json. These repeat development regression cases, not held-out evidence of general quality. The authored offline oracle outcomes were checked. No production writes.

The semantic percentage packet correctly included parseFloat(value)=7, parseFloat(total)=14 and an invalid-input guard of false for the first scenario. The model copied that false value into a structured assertion, yet wrote that the same input returned the invalid-number error because parsing produced NaN. Structured consistency was incomplete, not rejected: it cannot validate arbitrary prose. The bundle size budget also limited evidence retained for the second scenario. Character-count intermediate results were correct; separate model predictions still omitted the second count. Neither result justifies enabling this path by default.

## Next checkpoint

Do not keep tuning these two example prompts. The next architectural step is a bounded conclusion representation connecting a scenario, condition value and selected branch, with deterministic validation before prose generation. Test that mechanism on distinct small functions and unknown/unsupported paths. This is still a prerequisite for a useful live checkpoint; no live user rerun is requested from this pass. No migration, global model changes, commits or autonomous background work.
