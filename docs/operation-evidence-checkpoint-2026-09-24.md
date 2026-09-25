# Operation consequences and selection checkpoint

## Implemented

operationEvidence.js derives bounded, developer-authored conditional consequences from source AST nodes in the selected function. No analyzed source or generated code is executed. Rules cover ordinary unshadowed Set construction (uniqueness and insertion order), exact string whitespace splitting, exact ASCII/whitespace-preserving deletion, and non-optional property access on null/undefined parameters. A simple surrounding catch return is linked when its source is available; exact engine error messages and finally completion are not inferred.

Source bundles now include constructor nodes. Rules retain versioned source support and receiver/intrinsic assumptions. Shadowed Set, assignments, direct eval/with, optional access, nested-function ownership, default parameters and unmatched regular expressions are excluded conservatively. Source reads and final freshness checks are unchanged. Bounds remain eight operation facts and the existing bundle byte budget.

The model selects up to three citable operation IDs relevant to the question. Atlas validates those IDs and presents authored summaries in display and speech. Model claims supported solely by selected operation IDs are replaced by those summaries; additional claims with independent source evidence remain explicitly unverified model reasoning. This is not prose entailment verification. Relevance selection can still be unnecessary or incomplete. Rules do not certify whole-function behavior or arbitrary input values.

No model-default change, migration, production write, generated execution, autonomous background task or commit. The unsuccessful question-coverage prompt experiment remains default-off.

## Evaluation

Initial evidence-only comparison: backend/.local/spoken-analysis-audit/1790262435984.json. Missing-input reasoning improved, but repeated-word handling remained omitted. Adding another prompt checklist was not pursued.

Operation selection comparison on authored source fixtures: backend/.local/branch-conclusions-audit/1790262593635.json (auditOperationSelection.js now writes future results under operation-selection-audit). The Set fixture selected the uniqueness rule; the omitted-argument fixture explained TypeError and correctly identified that its catch returns an object rather than a string. Three existing branch probes remained correct. One successful-input probe unnecessarily selected the nullish-access rule: relevance is still imperfect.

Real-file two-conversation comparison: backend/.local/spoken-analysis-audit/1790262627443.json. Repetition/punctuation follow-up covered uniqueness and punctuation joining. Missing wordCount input described TypeError followed by the catch error string. One extra model sentence broadened nullish receivers to non-string receivers; it cited only the selected operation ID and is now replaced by the narrower authored rule. A source operation ID is not treated as proof of the model paraphrase.

After these calls, selected-operation-only paraphrase suppression was added and tested without another model tuning loop. Full offline and targeted validation results are recorded in the final turn response and backend/.local/operation-selection-tests.log.

## Live checkpoint

Restart backend and use a new Alice chat, all prompts in the same chat:

1. Analyze the keyword extractor with text set to red-blue red end input.
2. How does that file handle punctuation and repeated words?
3. Analyze the word count file with text set to red blue red end input.
4. What does that file do if I leave the input out?

Check Inputs understood for absence of the end-input marker and sentence period. Expected source behavior: keyword output redblue and red; duplicate processed words kept once; punctuation deletion can join words; word count 3; omitted text causes property-access TypeError caught into an error string. These are expected source behaviors, not live executed observations. Listen for usefulness and excess repetition as well as correct file/follow-up handling. User handles commits.
