# Thinking-enabled analysis evaluation

The first deeper-analysis evaluation uses connected source snapshots and function records, with sequential calls to the configured local general model. Both policies receive the same evidence and two-turn conversation tasks. Per-call limits are 10 minutes, 12000 shared thinking/output tokens and a 16384-token context, at temperature zero. No global model defaults changed. No generated code/tests are executed and no production knowledge is written.

The offline runner is backend/scripts/auditDeepAnalysis.js. It supports --case=search or --case=json and --think=on, off or both. It checkpoints running/completed/error states and final content after each turn under backend/.local/deep-analysis-audit. Raw native thinking is not retained; only its character count is recorded. A length-limited or empty response is incomplete, never counted as a successful explanation. Source freshness is checked around each response and fixed oracle execution. Interactive routing/context assembly is not under test in this runner; the connected evidence builder and actual local model endpoint are.

Two targets: search evidence with its linked helper, plus extractJSON as a separate transfer case. First turns request full explanations and concrete test suggestions. Follow-ups request exact results and challenge blanket claims. The oracle outcomes are from fixed authored calls to the inspected, pure local utility functions; they are withheld from prompts. Output length, completion and citation presence are not semantic pass criteria. This is a small single-run comparison, not a statistically reliable model ranking or deployment qualification.

## Search evidence review

Artifact: backend/.local/deep-analysis-audit/1790538344826.json. Off: approximately 26.3 and 13.8 seconds; on: 31.9 and 36.8 seconds. All four responses finished without exhaustion. Thinking produced nonempty native thinking metadata.

- Off, overview: correctly identifies the broad branches but wrongly predicts that "An error occurred here" matches /^error:/i. It also overstates what passing establishes.
- Off, follow-up: the mixed RESULTS_FOUND/error case is initially labeled false, then corrected to true within the same answer. Contradictory final prose is not a pass. The summary also drops the NO_RESULTS override and conflates marker and fallback conditions.
- On, overview: coherent structure, but incorrectly says success confirms minimum length and absence of failure patterns across all paths. Explicit success markers bypass helper filtering. Some citations point to comments rather than the claimed branch.
- On, follow-up: all four requested Boolean outcomes match fixed observations. However, the final explanation still claims passing means no failure markers and length >20, and implies an explicit marker establishes external verification. A marker string alone proves no external provenance. This answer fails the whole-explanation accuracy gate despite correct requested outputs.

The evidence-record phrase "source_expression_not_evaluated" was repeatedly treated as if it prevented reasoning from complete source. Future reasoning packets should distinguish the deterministic analyzer's capability limit from genuinely missing source information. This does not warrant promoting model interpretations to facts.

## JSON extractor review

Artifact: backend/.local/deep-analysis-audit/1790538465233.json. Off: approximately 23.0 and 20.2 seconds; on: 34.5 and 39.6 seconds. All four transport responses ended normally, not at the budget limit.

Off, overview: incorrect nested-object extraction, incorrect extra-brace and trailing-garbage examples, and unsupported broad claims that it simply returns the last valid object. The last closing brace stays fixed, so these details matter.

Off, follow-up: predicts the inner object for nested JSON and null for numeric 7, both incorrect. The actual results are the complete outer object and a TypeError before the parse catch. The tag example reaches the right object with an incorrect explanation and contradictory alternatives. Correct outputs alone would miss that failure.

On, overview: retains the broad candidate-search structure but incorrectly claims all exceptions are caught and that accepted candidates can be arrays. Content contains substantial drafting/self-narration before an apparent final section. That final section still makes unsupported no-throw claims.

On, follow-up: correctly predicts the nested outer object, primitive-array null result and trailing-brace null result. It wrongly predicts null for the tag example (actual {b:2}) and numeric 7 (actual TypeError). Several correct results have invented traces: for example it assigns a closing-brace index to [1,2], which has no closing brace. Additional suggested tests are incorrect: an array containing an object can yield that object; wrapping invalid extra braces need not parse; an object entirely before the last closing thinking tag is discarded. Content again mixes drafting/self-narration and final prose.

The source and task intentionally contain literal thinking-tag strings. These may interact with model/provider channel handling, but this comparison does not isolate or prove that cause. Do not treat leaked drafting text as a useful final explanation, or infer that suppressing it would fix the semantic errors. A separate controlled channel-integrity check should precede exposing this path to speech or storage.

## Decision at this checkpoint

All eight calls completed, with thinking runs taking roughly 32–40 seconds; no run needed the full 10-minute allowance. The results therefore do not justify assuming that extra wall-clock allowance alone will solve these failures. Thinking showed useful capability on some predictions, but neither policy passed whole-answer accuracy on either target. Do not promote the answers into trusted project knowledge, change interactive defaults, or enable background learning yet.

Next work should separate source facts from analyzer capability warnings in the reasoning packet, establish clean final-answer/channel handling, and review individual behavioral claims against independent evidence across additional held-out cases. Keep this evaluation as a regression artifact rather than repeatedly tuning these prompts. The evaluation is offline; it is not a live production routing or persistence acceptance test.

## Validation and boundaries

115/115 offline test files passed in backend/.local/deep-analysis-tests.log. This validates the harness preparation/reference cases and existing mechanics, not the model answers. No live Alice prompts are needed for the offline comparison. Existing interactive Analyze commands still use their current bounded outlines. The thinking path is experimental and does not populate reusable knowledge.
