# Connected evidence for deeper analysis

analysisContext.js assembles complete numbered source snapshots with versioned function records, supported call-binding edges, argument-expression/parameter mappings, unresolved calls and explicit omissions. It uses existing conservative static relations rather than guessing targets from names. Linked helper records retain their own conditions, exits, assumptions, outlines and completion limits. Source text is data; the assembly step does not invoke models or execute analyzed code.

Default limits: two helper levels, eight function records, 32000 serialized characters. Maximum configurable bounds remain enforced. A helper can be statically linked but omitted from the packet; targetIncluded and omissions distinguish that case. Cycles reuse records instead of recursively duplicating them. Omitted arguments are recorded as omitted_at_call, not substituted values. Spread/destructured parameter mappings remain unresolved. Linking does not prove runtime invocation, dispatch, purity or results.

Every inventory record must match the current complete source, analyzer version and full inspected dependency manifest. Packet keys include records, edges, source versions, omissions and limits. Changing an inspected dependency invalidates the context even when the caller source is unchanged. The offline inspection command rechecks source freshness before writing a diagnostic JSON file under backend/.local/analysis-context. No production memory writes or migrations.

Read-only source inspections:

- 1790373649536.json: hasVerifiedSearchEvidence includes isUsableSearchResult and both records' source evidence, without omissions.
- 1790373649848.json: parseUnitConversionRequest links normalizeArithmeticExpression, but the helper is explicitly omitted under the default character budget. Its source relationship is not presented as an included or understood body. A later reasoning evaluator must respect this gap or select a larger bounded packet; the interactive budget has not been changed.

Tests cover local/imported helper links, shadowing, omitted arguments, cycles, depth/node/character bounds, deterministic serialization, stale inventory rejection and dependency-only changes. Suite log: backend/.local/analysis-context-tests.log.

This is an offline foundation, not a new Alice command. No additional live acceptance prompts are necessary. The next phase is the return to deeper model analysis: sequential thinking-enabled evaluations with longer explicit budgets over these packets, held-out tasks and independently judged correctness/usefulness. Model interpretations remain separate from source facts and executed observations. Neither automatic persistence nor background scanning is enabled. No global thinking/model default changed in this pass.
