# Canonicalization safety checkpoint — 2026-09-07

The user confirmed the topic cleanup retrieval checks and committed that work before this pass.

## Completed in this pass

- Removed word-overlap shortcuts that classified paraphrases as equivalent with confidence 1. Overlap still selects candidates, but semantic review decides non-exact equivalence.
- Kept the fast path for matching subject/key and identical trimmed values. Value punctuation, signs, and case are preserved; procedure trigger/action differences also prevent this shortcut.
- Enforced memory scope and conflicting explicit subject qualifiers after classifier output, for equivalent, update, and conflict decisions. Version-conflict shortcuts also respect these boundaries.
- Rejected malformed classifier indices and confidence values instead of coercing them into valid-looking decisions.
- Prevented a detected composite value from being classified as equivalent to a component even when their property keys are identical.
- Clarified classifier instructions about negation, quantities, units, platforms, temporal scope, untrusted memory text, and replacement evidence.

## Validation and limits

All 18 local knowledge/canonicalization test files passed. Regression cases include negation, changed quantities, numeric signs, case-sensitive units, platform restrictions, proposed versus implemented behavior, model variants, composite claims, invalid output, and classifier failure. Existing retrieval, merge/decomposition, topic cleanup, and verification tests remain green.

Semantic evaluator responses in these tests are controlled fixtures. They prove that differing claims reach semantic review and that output validation works; they do not measure live-model classification accuracy. Paraphrase handling now needs additional model calls. Candidate ranking remains lexical and can still miss very different wording.

No migration, live record merge, deletion, or reverification was performed in this pass. The existing exact-identity upsert behavior is unchanged. This is not a claim that all contradiction or temporal-update cases are solved.

## Next work

Update: the read-only live evaluation and initial safeguards were completed on September 8. See `memory-canonicalization-evaluation-2026-09-08.md` for the measured failures, mitigation, and remaining work.

Build a read-only, varied live-model evaluation set for equivalent, distinct, conflict, and update decisions before expanding automatic merges. Include aliases, missing qualifiers, historical versus current facts, and cross-domain examples. Use those results to improve candidate recall and assess explicit update evidence. Keep the remaining ambiguous topic records and record 66 decomposition under review rather than bulk-merging them.
