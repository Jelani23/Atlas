# Explicit scenarios connected to function records

## Implemented

functionScenario.js binds only explicitly supplied primitive arguments to a complete, version-matching function record. Missing arguments remain unknown; no inferred undefined or input substitution. Scenario arguments, source record key, completion paths and outcome remain separate from model interpretation. Dynamic scope or visible potential prototype/intrinsic mutation makes the scenario unresolved.

The completion evaluator reuses bounded string/Boolean operations from primitiveSemantics rather than adding filename-specific behavior. Identifier-call intrinsics remain disabled until binding resolution is integrated. Supported template interpolation preserves full returned strings and rejects unknown/nonprimitive coercion. Scenario evaluation has the same traversal, output and scope limits as completion analysis.

For supported async bodies with one unconditional primitive outcome, reporting distinguishes promise fulfillment/rejection from synchronous return/throw. Thenable/nonprimitive assimilation, await and arbitrary calls remain unresolved. This is a static consequence under recorded assumptions, not observed promise settlement.

The explicit Analyze + parameter assignment path now builds function records before source projection and obtains a deterministic scenario outcome. The model's claims, predictions and unknowns lists are empty in this mode; nonempty lists are suppressed defensively. Model-selected authored operation summaries remain available. Intermediate values cannot populate the dedicated outcome field. General source questions/follow-ups and developer bundle mode without analysisMode retain their previous explanation behavior; this is not a universal free-prose validator.

Word count with supported text derives the entire string Word count: 3 and identifies promise fulfillment. Keyword extraction remains unresolved because its Set/filter pipeline is outside this completion subset; it no longer reports the lowercase intermediate string as its final outcome. That unresolved result is a capability boundary, not proof of complete understanding.

## Validation

The first suite/audit sessions were interrupted before their completion summaries. Completed model turns were retained in backend/.local/spoken-analysis-audit/1790273634411.json. Remaining probes were resumed sequentially in 1790293216191.json. The resumed pre-report-tightening suite passed 108/108 files in backend/.local/function-scenario-tests-resumed.log.

After constraining explicit scenario output, tests cover suppression of incorrect model predictions AND narrative, source-version mismatch, duplicate/unknown bindings, formatted returns, async wrappers, catch/finally outcomes, unsupported constructors, nullish access and intrinsic mutation. Real conversation routing and spoken-input integration tests passed.

Final model comparison: backend/.local/spoken-analysis-audit/1790293346288.json. Both calls completed (about 2.2 and 3.3 seconds model time). The displayed word-count outcome was a promise fulfilling with the string Word count: 3; keyword extraction was unresolved with authored operation explanations. No competing model outcome or narrative was displayed. One unnecessary nullish-operation explanation remained on the successful word-count case; operation relevance and verbosity are not solved. A duplicate per-outcome unexecuted-test notice was removed afterward, retaining the common final notice.

Full final suite log: backend/.local/scenario-report-tests.log. No production writes, migration, global model-policy change, generated-code execution or commits.

## Live checkpoint

Restart backend and open a new Alice chat:

1. Analyze the character count file with text set to a b end input.
2. Analyze the word count file with text set to one two three end input.
3. Analyze the keyword extractor with text set to blue-green blue end input.

Expected: character-count promise fulfillment with the formatted counts 3 and 2; word-count promise fulfillment with the string Word count: 3; keyword final outcome explicitly unresolved. Check that no intermediate-only prediction appears beside these reports. This checkpoint tests output authority/type preservation and honest unresolved behavior, not complete code understanding.
