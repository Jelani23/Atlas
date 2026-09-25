# Evidence-first code analysis: adjusted implementation plan

Status: design proposal based on the current working tree, including the uncommitted follow-up source-selection fix. This document does not enable a new pipeline or change database records.

## 1. Current request-to-answer paths

There are several paths, not one unified analyzer:

| Request | Current path | Evidence and limitations |
| --- | --- | --- |
| Spoken file question / “that file” follow-up | `conversationEngine` → `projectQuestion.detect` → read permission → `projectQuestion.createService().answer` → immediate reply | Complete numbered source; exact-file saved interpretations; current approved checked outcomes if present. Raw source and these records go to the general model. JSON claims cite line numbers that must exist. Source is reread before returning. No semantic proof, dependency expansion or AST bundle. |
| Learn / Relearn / Recall | `projectUnderstanding.detect` → service → configured repository | Complete source, source hash, agent ownership, schema and analysis-method revision. Learn generates observations and predictions with exact matching quotes. Optional `PROJECT_UNDERSTANDING_STRUCTURE` adds a syntax map. Recall/unchanged Learn can reuse records. |
| Check | Same project-understanding service → `profileEvidence` / `evidenceContracts` | Requires a learned current version. Runs developer-authored, allowlisted isolated checks for two files; saves scoped observations with dependency/check fingerprints. Does not execute model-generated tests. |
| Read code then review | Planner/readCode → `codeEvidence` → `validatedAnalysis` | Retained session/agent evidence, parser checks, structured defect/test candidates, citation validation, model counterevidence pass. That second model pass is not independent verification. Ordinary explanation follow-ups can also use retained evidence through the conversation context. |
| Focused symbol experiments | `focusedAnalysis` / audit scripts | Syntax-map-based excerpts and model predictions. These experiments are not a replacement production pipeline. |

`sourceReader` already enforces backend/src containment, checks real paths, supplies SHA-256 versions and numbered lines, and rejects mismatched versions. Each read is bounded to 200 lines and 8,000 characters; the current question path requires complete coverage. `projectCache` supplies the filename index, not a proven symbol or caller graph.

`sourceStructure.js` already uses the installed **TypeScript 5.9.3 compiler API** to parse JavaScript. It locates functions, require/import expressions, conditions, returns, throws and export assignments. Its flat entries are capped at 40 / 5,000 characters; descriptions may be clipped. It does not resolve imports, establish general call edges, connect returns to guards, or prove data flow. Simply enabling this existing map is insufficient.

Reuse this parser and the existing filesystem, session, permission, cancellation and storage boundaries. Do not introduce ts-morph, Tree-sitter, Python or a second parser for milestone one. TypeScript-language support itself still needs a separate reader/parser contract; installed parser capability does not mean current paths accept .ts files.

## 2. Revised workflow

```text
Spoken target + exact question + scoped follow-up
  → resolve file / optional symbol (clarify ambiguity)
  → bounded, versioned source snapshot
  → AST facts with symbol ownership and source ranges
  → bounded local dependency resolution
  → evidence bundle + explicit coverage gaps
  → one model interpretation using evidence IDs
  → deterministic reference/fidelity/coverage validation
  → concise answer + separate on-screen evidence
  → explicit Learn storage only, in a later integration step
```

The change is a shared evidence-builder boundary before generation, not another independently implemented answering route. Add it to ordinary questions first; adapt Learn and review after evaluation establishes its value. The builder must not import/execute analyzed modules or load their package configuration as executable code.

## 3. What “deterministic” can establish

An AST can establish that a condition appears before a return, that a call expression exists, or that a return is lexically inside a branch. It cannot generally establish which branch a runtime value takes, whether an arbitrary call mutates state, or whether a dynamic receiver resolves to a particular function.

Replace the broad “verified facts” bucket with provenance classes assigned by Atlas:

| Class | Meaning |
| --- | --- |
| SOURCE_OBSERVED | Parser-located declaration/expression with exact source span and version. |
| STATICALLY_DERIVED | A named deterministic analysis rule established a relation under recorded assumptions. Initially a small supported subset only. |
| EXECUTION_OBSERVED | Exact outcome from an approved runner, with inputs, injected state, assertions and source/dependency/runner versions. Existing Check evidence fits here. |
| MODEL_INFERRED | Model interpretation, even if references are valid or a critic agrees. |
| UNKNOWN | Not established within the inspected scope. |

Whether evidence came from a test is metadata, not a stronger whole-file truth tier. A passing assertion verifies its scenario, not a general claim. Syntax validity and source freshness are separate statuses.

Reserve STATICALLY_DERIVED for actual implemented rules. Do not allow the model to self-label prose with it. “No mutation found” must remain scoped to inspected syntax; it is not proof that a dependency is pure.

## 4. Narrow first milestone

### Extraction

Support JavaScript functions, named function expressions/arrows and simple local bindings already common in Atlas. Give symbols scope-qualified IDs, not just names; nested functions must not donate their returns to enclosing functions.

Extract parameters/default syntax, local declarations/assignments, imports and CommonJS bindings, export bindings, call sites, if/else nesting, conditional expressions, short-circuit operator syntax, returns, throws and await sites. Preserve source order and parent/owner IDs. Unsupported constructs are marked, never flattened into a falsely complete control-flow graph.

Initial flow facts are modest: statement ordering within a supported block; a return belongs to a particular branch; an assignment initializes a local from a call; later syntax reads that binding. A full alias analysis, type checker, exception graph, loop analysis and async effect model are out of scope. Property reads, getters, callbacks and dynamic dispatch can invalidate naive flow assumptions, so record those limits.

### Dependencies

Resolve direct local literal imports/requires and simple exported bindings only. Include same-file lexical helpers needed by the target, within the same budget. External packages, computed require arguments, shadowed require bindings, dynamic exports and unresolved calls receive explicit unresolved reasons. Preserve caller-side argument expressions and callee-side parameter names without pretending to know runtime values.

Proposed initial limits: target plus at most two dependency files, one cross-file hop, 16,000 total source/evidence characters, existing 200-line/8,000-character complete-read limit per file. Limit overflow becomes a visible coverage gap, not silent truncation. Keep the existing 45-second model deadline, cancellation and global model defaults. Measure the expanded input against the current 8,192-token context before enabling it.

A new resolver must permit relative `../` imports only after resolving them against the importing file and verifying the canonical target is still inside backend/src. Never relax the reader's user-path traversal boundary. Use exact extension candidates (.js/.json and explicitly supported index resolution), no guessed filename matching for import edges. Detect cycles and deduplicate reads.

Do not build repository-wide callers yet. Record resolved edges within the inspected bundle and mark broader callers `not_inspected`. An empty caller list must never mean “unused.” Include data/config dependencies as source data where supported; type/external dependency analysis is deferred.

### Bundle contract

Keep full source internally; send relevant source alongside facts so the model can inspect the original expressions. IDs are generated by Atlas and scoped to bundle version, not invented by the model.

```text
bundleVersion, extractorVersion
projectKey, agentId, target { file, symbolId? }
request { exactText, examples [{ id, exactText, interpretation? }] }
files [{ path, hash, coverage, parseStatus }]
symbols [{ id, ownerId, kind, span, parameterSyntax }]
facts [{ id, class, rule?, symbolId, span, expression, relatedIds, assumptions }]
dependencies [{ fromSymbol, callFactId, target?, status, reason? }]
executionObservations [existing approved evidence only]
coverage { inspected, omitted, unsupported, checklist }
```

Source spans include file, line/column or offsets, and file version. Facts refer back to exact spans. Explicitly separate stored model hints from parser facts. The current question route only checks source freshness for stored interpretations; method/extractor revisions and all included dependency versions must also be checked before reusing future bundles. Recheck every included file before returning an answer, not only the target.

## 5. Claims, fidelity and speech

Ask the model for a small set of distinct claims with `evidenceIds`, `exampleIds` and unresolved questions. Atlas resolves IDs into citations. The model must not supply authoritative filenames or line numbers. Each claim retains MODEL_INFERRED status unless it is an Atlas-rendered deterministic fact.

Reference validation proves that the cited fact exists, not that the claim follows from it. Deterministic checks can reject unknown IDs, wrong symbol ownership, stale versions, malformed values and contradictions against explicitly supported fact fields. Arbitrary prose entailment remains unverified. Preserve parser facts when the model fails; do not emit a confident explanation as a fallback.

Preserve the exact user question and quoted examples. For speech such as “two plus three,” retain that phrase separately from any proposed interpretation as `2 + 3`; never overwrite the original. Example IDs and deterministic rendering protect labels and exact inputs. Semantic fidelity cannot be guaranteed by string matching when speech is ambiguous; ask a short clarification when the interpretation changes the answer. Do not implement a broad natural-language interpreter as part of this milestone.

Generate speech from the accepted claim objects in one presentation path, with citations retained on screen and the existing short uncertainty statement. Do not add a second model “rewrite for speech” that could change facts. Ask for direct answers and distinct supporting details, but do not claim a prompt can guarantee non-repetition. Avoid fuzzy text deduplication that could merge opposite conditions.

## 6. Completeness and the critic

Use checklist states `covered`, `not_inspected`, `unsupported`, `not_applicable`, each with scope/reason. Unknown or uninspected must not be labeled not_applicable.

Full symbol analysis uses the wider checklist from the proposal. An ordinary question uses only relevant categories; it should not read every category aloud or require full-project coverage for a small question. Purpose and assumptions remain interpretations, while parameter/return syntax is source-observed.

The first critic is deterministic validation. Defer an additional model critic: Atlas already has a model review path, and recent trace experiments propagated incorrect conclusions. If later evaluated, model critique may flag unsupported claims but cannot promote them to verified status. Avoid automatic regenerate/retry loops; return a bounded partial answer with precise gaps when validation fails.

## 7. Storage and future growth

First milestone is read-only ordinary questions with ephemeral bundles. No migration and no automatic saving.

Later integrate explicit Learn/Recall through the same builder. Migration 017's `project_understanding` table currently requires schema 2 and status `interpretation_unverified`; do not silently insert a new top-level verified/symbol schema into it. Design a versioned record migration or a compatible nested extension deliberately, with legacy reads and status semantics tested. Keep agent/project ownership and current Check evidence intact. Do not transfer this into human profile memory or general world knowledge.

Use source hashes, dependency hashes and extractor/analysis revisions for freshness. Git commit is helpful provenance but cannot represent uncommitted working-tree edits. Symbol hashes, reverse dependency invalidation and hierarchical module/project synthesis are later work.

Runtime verification already exists for approved fixed scenarios. Preserve it. Generated-test execution remains outside authorization and scope; the attachment's generated-test example is a future design discussion, not permission to execute it. Autonomous scanning and project switching are also deferred.

## 8. Acceptance and implementation sequence

1. Build parser facts and bundle contract with fixture tests: lexical ownership, nested returns, guarded returns, aliases/shadowing, local import resolution, cycles, unsupported syntax, partial coverage and source changes. No model runs required for extraction correctness.
2. Integrate the builder once into `projectQuestion`, retain spoken targets and scoped follow-ups, and validate ID-based claims. Keep current permissions, no-write behavior, timeout and speech separation tests.
3. Compare existing direct answers against bundle-backed answers using fresh held-out files and realistic follow-ups. Use fixed authored execution oracles in development plus manual review of responsibility, exact inputs/results, relevant coverage, contradiction and repetition. Keep calls sequential and generation budgets comparable. A citation match, longer answer or checklist count is not a semantic score.
4. Enable only after the comparison shows useful improvement without meaningful factual regressions. Otherwise keep the extractor/bundle as tested infrastructure and record the failed evaluation without adding filename-specific fixes.

Learn/review adapters follow this gate, then persistent symbol knowledge; broader callers, richer data flow and background refresh come later. This is the smallest shared architectural step: replace the unstructured source packet with a versioned, provenance-aware evidence bundle, while retaining existing routing and safety boundaries.
