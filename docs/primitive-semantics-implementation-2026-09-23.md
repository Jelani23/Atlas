# Bounded primitive semantics

## Implemented and validated

Completed and validated the initial primitiveSemantics implementation already present in the working tree. The experimental question service accepts explicit input-to-parameter bindings for a selected symbol. Only bounded JSON string literals are decoded; spoken inputs and parameter associations are not guessed.

Supported expression rules: string/number literals, the explicitly bound string parameter, parentheses, string/array length, trim, lowercase, unshadowed parseFloat and Number on strings, and two exact developer-owned whitespace split/removal patterns. Source regexes are never compiled. No eval, Function, analyzed-module loading, generated tests, callbacks, arbitrary property reads or general source execution. Recursion, input size, result size, fact count and bundle size are bounded.

Results retain types, including NaN, negative zero and Infinity. Facts are STATICALLY_DERIVED with source evidence and assumptions: JSON-decoded input bound to the specified parameter, ordinary unmodified JavaScript intrinsics, and the expression reached with that value. They do not prove reachability, local-variable propagation, branch selection, full return values, external effects or function correctness.

Unknown calls/operations, rewritten parameters, shadowed built-ins, direct eval/with and detected property mutation prevent the applicable results. Conservative declaration scanning includes namespace imports. A test exposed an AST-position collision: a receiver identifier and its unsupported enclosing call shared a start offset, allowing the identifier value to be attributed to the call. Matching now requires node type and end offset as well as start offset. Regression tests cover unsupported calls/chains and ensure only correctly typed results are attached.

The response retains mechanically derived results separately as staticEvidence and renders an Atlas-authored on-screen section with exact input, expression, typed result and source. This section is conditional expression evidence, not an executed test report or whole-function prediction. It is not automatically narrated. Model predictions remain separately labeled MODEL_INFERRED and may still be wrong.

## Comparison

`backend/scripts/auditPrimitiveSemantics.js` compares symbol-scoped bundle answers with and without explicit semantic bindings. Four sequential calls with the existing model and budgets, fixed authored oracles, isolated storage. Fresh values on previously examined files; a small controlled development comparison, not broad held-out certification.

Report: `backend/.local/primitive-semantics-audit/1790217042358.json`. The model acknowledged the supplied parseFloat result 7 for `7kg`, then invented a rejection because the original string was not purely numeric. That final prediction is wrong. It used the supplied character lengths for the other probe but omitted the requested whitespace-removed counts. Intermediate facts helped some statements without establishing end-to-end accuracy. No further prompt tuning against those expected answers was performed.

The comparison preceded the final deterministic display section, final packet-budget check and extra regression assertions; those presentation/boundary changes were verified with offline tests rather than another model run.

## Validation and rollout

The full suite passed 100/100 test files before final hardening; it was rerun after restoring an encoding-interrupted local file write and adding integration tests, with the final result recorded in `.local/primitive-semantics-final-tests.log`. The affected primitive semantics, question, bundle, symbol and input-preservation tests also passed. No repository work was discarded during recovery.

Runtime remains unchanged: explicit development options are required, and live questions do not enable the new analysis pipeline. No migration, production writes, global model changes or commits. No user live testing is needed yet.

## Next boundary

The next useful work is structured consistency checking between machine-derived intermediate facts and the model's statements, together with carefully scoped local value propagation. Do not treat a valid evidence ID as semantic agreement, and do not grow this into an unbounded interpreter. Full-function outcomes require additional proven rules or existing approved runtime scenarios, not model confidence.
