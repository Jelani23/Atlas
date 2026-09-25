# Target-symbol projection

## Implementation

The experimental question service accepts an explicit `targetSymbol` alongside filename/question when `evidenceBundle:true`. `symbolScope.js` selects a unique top-level function declaration or variable-bound function. Nested symbols, class methods and duplicate names are rejected rather than analyzed without their enclosing context. Symbol names are not automatically inferred from speech in this slice.

The projection retains the target, its nested functions and transitively followed supported static call links. Same-file resolved helpers are retained. Module initialization/configuration remains context; unrelated standalone functions and export wiring are excluded. Mixed declarations and dynamic module setup are conservatively retained. Dependency files remain inspected context rather than being assumed to execute on the target path. Unresolved helpers may be absent, and that limitation is explicit.

Original source character positions and line numbers remain intact: excluded text is masked, not renumbered. Whitespace inside retained source is preserved. The model receives projected source marked incomplete, a target identity, retained facts and an omitted-symbol list. The full read manifest and freshness checks remain owned by the original builder. Projection occurs after the existing bounded full read; it does not enable large-file ingestion.

File-wide stored interpretations and checked observations are omitted from a symbol-scoped model packet until they have symbol-level applicability metadata. Deterministic screen coverage names the selected target. Citable IDs are recomputed after projection; relations whose support was excluded cannot be cited. No extra generation/critic pass or model policy change.

## Verification

99/99 offline test files passed. Later targeted symbolScope, sourceBundle and questionInputs tests passed after class-method rejection, omitted-symbol reporting and target coverage were added. Tests cover exclusion of tool extractParams code, same-file helper closure, nested helper inclusion, module constants, ambiguous/missing/nested targets, method rejection, unmodified complete-read snapshots, freshness, and service integration.

Controlled regression: `backend/scripts/auditSymbolScope.js`; `backend/.local/symbol-scope-audit/1790194869954.json`. Both variants use the experimental bundle and input-ID path; the difference is explicit target scoping. Four sequential calls under existing model/budgets, fixed authored oracles, isolated storage. These are the previous fidelity probes, not fresh held-out examples. Comparison preceded the final reporting/unsupported-method refinements.

Scoped responses stopped discussing extractParams as though direct function arguments had to pass through it. Exact original input labels were retained. However, percentage still rejected a numeric-prefix string that parseFloat accepts, and character counts were still wrong. Removing irrelevant responsibility did not repair JavaScript semantic reasoning. No prompt tuning to these expected outputs followed the comparison.

## Rollout and limits

Still development-only; the live constructor does not enable the bundle path. No migration, production writes, generated-code execution or commits. No user live tests needed.

The architecture now separates source evidence, static relationships, input labels and target scope. The next semantic work should be a separately bounded deterministic-rule layer or evaluation of how models use established semantic facts, not another style prompt or another generic critic pass. Such rules must be explicit about supported operations, preconditions and shadowing; arbitrary source evaluation is not enabled by this implementation.
