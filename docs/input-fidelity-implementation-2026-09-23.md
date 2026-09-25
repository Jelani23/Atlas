# Preserved inputs and structured predictions

## Implemented in the experimental bundle path

`questionInputs.js` extracts up to four explicitly double-quoted, backtick-delimited or curly-double-quoted spans, preserving exact text, offsets, spaces and escapes. It does not decode escape sequences or interpret unquoted speech. Quoted spans may be concepts rather than inputs; their presence is not an instruction to execute them. The complete original question is still retained.

For questions containing these spans, the model returns a separate predictions array with input IDs, outcome text and evidence IDs. Atlas rejects unknown/duplicate IDs, extra input-replacement fields and invalid evidence references, then attaches the original text itself. The same bound prediction records feed screen and speech presentation. Predictions without preserved input references are rejected. Outcomes remain MODEL_INFERRED, not observed execution. Free-form claims/outcome text can still contain incorrect paraphrases or reasoning; this protects structured input labels, not all prose entailment or outcome-to-input correctness.

No changes to ordinary live generation, database records or global model defaults. No new generated code execution. Unquoted spoken examples require a later interpretation/clarification design; this change intentionally does not guess that “two plus three” means a particular literal string or expression.

## Validation

98/98 offline test files passed. Following a final check rejecting unbound predictions, targeted questionInputs and real conversation routing tests passed again. Tests cover exact spans, leading/repeated spaces, escapes, tabs, unknown and duplicate IDs, injected replacement text, limits, no-input behavior, and shared screen/speech rendering.

Fresh-input comparison: `backend/scripts/auditInputFidelity.js`; report `backend/.local/input-fidelity-audit/1790194586100.json`. Four sequential calls, existing general model and budgets, isolated storage and fixed authored execution oracles. Percentage is a new file in these development probes; characterCount is a previously examined file with new strings. The production source was not modified to fit the probes.

| Probe | Oracle | Direct | Bundle + preserved predictions |
| --- | --- | --- | --- |
| percentage: 12cats / cats12, total 24 | 50.00% / invalid numbers | Incorrectly rejects both | Incorrectly rejects both, but original labels preserved |
| characterCount: surrounding/repeated spaces / hyphen | 6 and 2 / 3 and 3 | 6 and 3 / 3 and 2 | Incomplete 5 / 3 predictions; labels preserve exact spacing but model confuses direct function invocation with extractParams |

Decision: fidelity binding works structurally; semantic accuracy remains insufficient for production enablement. Do not interpret grammatical validity or exact input display as a correct prediction. No further tuning against these probes was performed.

## Next bounded step

Target-symbol scoping needs to distinguish direct function analysis from tool-routing/parameter extraction. Current bundles include multiple responsibilities from the same file; models blend them even when ownership facts exist. A future projection should select an explicit symbol and retain its needed module/dependency context while marking excluded paths. This is distinct from implementing a general interpreter or silently transforming spoken inputs. No live user tests, migration or commits needed for this development-only slice.
