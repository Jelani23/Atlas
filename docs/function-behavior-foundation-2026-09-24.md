# Unified per-function behavior records: foundation

## Implemented

`backend/src/reasoning/functionBehavior.js` consumes a complete, unprojected source bundle and builds one record per function using the existing TypeScript parser. It does not load analyzed modules, execute expressions, invoke models or write knowledge storage.

Each record contains source/version spans, function identity and parameters, async/generator flags, exact return/throw expressions, if-condition enclosures, try/catch/finally regions, calls/constructors, syntactic state-access candidates, source-level derived-evidence references and explicit analysis gaps. Separate executedObservations and modelInterpretations arrays start empty. Return expressions are labeled source_expression_not_evaluated; all whole-function completion remains unresolved.

Nested functions receive their own records. A callback's returns do not appear in its enclosing function. Expression-bodied arrows have a source-observed implicit return; a bare return records no expression. Class initialization is excluded explicitly rather than misattributing instance field calls to the enclosing function.

Exception regions capture source nesting, catch bindings, and finally spans. Exit/call records list enclosing handler candidates, nearest first; a catch cannot catch its own rethrow. These candidates do not certify routing: implicit exceptions, asynchronous rejection and intervening finally completion are unresolved. Conditions are lexical enclosures, not a feasible-path enumeration; a return after an if is not incorrectly labeled as carrying that if's negation.

Known calls reuse the existing conservative static binding evidence. Others remain unresolved. Property accesses, assignments, increment/decrement and delete are candidates only; closure/global identifier resolution and side-effect propagation remain next work. No claim of complete external reads/writes.

The record cache key includes analyzer/bundle versions, the complete serialized record and inspected dependency versions. This invalidates when inspected dependencies or available evidence change even if caller source is unchanged. Uninspected dependencies remain explicit gaps; the key is not a claim of runtime reproducibility. Source-level derived references exclude input-specific scenario facts.

## Inspection and validation

Developer command:

    node backend/scripts/inspectFunctionBehavior.js src/utils/keywordExtractor.js src/tools/utilities/wordCount.js

Reads source and writes only a diagnostic JSON under backend/.local/function-behavior, with source freshness checks before completion. No model call, database change, migration, production execution or commit.

Initial real-source inspection produced separate records for extractKeywords and its callback, and for wordCount and extractParams. wordCount has two return sites and one try/catch region. The keyword extractor's returned Set expression is stored as source, not a guessed string result.

106/106 offline test files passed in backend/.local/function-behavior-tests.log. Targeted functionBehavior tests passed again after final class-initializer exclusion/cache-key adjustments. Tests cover nested ownership, if enclosures, nested catches/rethrows, finally regions, arrow/bare returns, async metadata, state candidates, unknown paths, dependency invalidation, static call links, unprojected/contiguous source requirements and deterministic records. Diff whitespace checks passed.

## Next implementation

This is an extraction foundation, not a completed behavior analyzer. Live question answering is deliberately unchanged. Next: derive a bounded normal/abrupt completion representation from these records and connect answer outcomes to explicit return/throw evidence, keeping unsupported paths unresolved. External-state resolution and additional controlled execution can then attach to this common representation. No user live test is needed for this extraction-only step.
