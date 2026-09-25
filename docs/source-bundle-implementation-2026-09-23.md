# Source evidence bundle: first implementation slice

## Implemented

`backend/src/reasoning/sourceBundle.js` uses the existing TypeScript parser without executing analyzed code. It produces source-observed facts with IDs, exact spans, symbol ownership, branch-parent relationships, parameter syntax, bindings, calls, returns, throws, assignments, conditional/short-circuit syntax and await sites. Nested functions retain distinct owners. Loop/try/switch semantics are explicitly not derived. Fact and expression limits are reported; clipped facts cannot be used as claim references.

The bundle includes the exact question, agent/project identity, source versions and coverage gaps. Literal relative imports/requires are resolved within the restricted source reader; external, dynamic and conservatively detected shadowed requires are left unresolved. Resolution is one hop, target plus two dependency files maximum, with a 16,000-character serialized bundle cap. Complete dependency source can be retained with only function declarations if its detailed map exceeds the budget. That omission is recorded; it is not complete dependency flow analysis. All included files are reread against captured versions before accepting an answer.

The question service accepts `evidenceBundle:true` as an explicit construction option. It supplies the bundle and asks for evidence IDs instead of line numbers. Atlas validates IDs and resolves actual citation spans, including dependency citations. Model claims remain MODEL_INFERRED. Spoken output uses the same claims without citation narration. Default construction, including live conversation, remains the existing direct-answer path pending the semantic gate. No hidden environment setting or global model change was introduced.

## Deliberate limits

This is the first infrastructure slice, not the entire design milestone. Import source retrieval is implemented; export-binding/callee identity resolution, general data-flow proofs, precise call graphs, symbol-target selection and caller search are not. The bundle class is SOURCE_OBSERVED; no STATICALLY_DERIVED outcomes are invented. Original inputs are retained in the request, but semantic example-fidelity validation is not yet implemented. Natural-language claim entailment is not checked by ID existence. No generated tests, autonomous scanning, knowledge writes or schema migrations.

The old optional `sourceStructure` map remains compatible for Learn; it is not silently replaced. New bundle-backed answering uses the same question service rather than a new user-facing command. The old map and bundle can be consolidated after their consumers migrate.

## Validation

96/96 offline test files passed after adding sourceBundle tests to the runner. Subsequent targeted sourceBundle and real source-conversation tests passed after bounded dependency-map fallback and expanded regression tests. Coverage includes lexical return ownership, branch parent links, exact ID binding, invalid/clipped references, relative dependency retrieval, external/dynamic/shadowed imports, traversal, cycles, budget rejection, parse errors, partial source rejection, dependency edits, and separate spoken/display output. Citation versions were subsequently attached from the already validated file manifest and sourceBundle tests rerun.

## Sequential model comparison

Script: `backend/scripts/auditSourceBundle.js`. Same configured general model, thinking off, 900 output tokens and 45-second deadline. Isolated empty retrieval, real source-question service and fixed author-written function calls; no production writes. Two fresh utility-file probes and one integration probe using the previously discussed conversion parser. This is not a full live conversation or large held-out evaluation.

Initial report `backend/.local/source-bundle-audit/1790193714526.json` showed detailed dependency facts exceeding the bundle budget. After adding explicit source-plus-declarations fallback, final paired report: `backend/.local/source-bundle-audit/1790193781939.json`. All six final calls completed. Same probes were reused to verify the mechanical budget change; they were not repeatedly tuned for semantic answers.

| Probe | Direct answer | Bundle-backed answer |
| --- | --- | --- |
| Empty string / red blue word count | Incorrectly predicts 0 for empty string; actual output is Word count: 1. Correctly predicts 2 for red blue. | Same empty-string error despite valid fact IDs. |
| Tab whitespace character count | Correct counts 3 and 2, correct whitespace explanation. | Correct counts and whitespace explanation; still some repetition. |
| Conversion parser and normalizer responsibilities | Identifies missing dependency, gives general non-evaluation explanation without exact null result. | Dependency source now present, but imprecisely describes a numeric string becoming a Number object, misses the rejecting guard's consequence, and still lists evaluation as uncertain. |

Decision: keep the new generation path opt-in for development. The extraction/citation infrastructure works, but this small comparison does not justify replacing live answers. More source and correct references do not make the model's behavioral predictions correct.

## Next bounded work

Implement exact import/export binding resolution and a small set of explicit static relation rules, with coverage-aware claims. Evaluate whether those facts actually improve predictions before expanding the graph or enabling live generation. Do not solve the word-count example with filename-specific instructions or claim universal static execution. No new live prompts are needed while the default response path is unchanged. No commits made.
