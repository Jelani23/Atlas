# Source inspection foundation

## September 18 acceptance fixes

User acceptance exposed a real routing regression: the noun "read" in "database read fails" selected readCode, and the failed read then cleared retained source evidence. Read requests now use a shared explicit-command parser in the resolver and fallback routes. Source explanation/review follow-ups bypass action routing. `Read out agentProfiles` is normalized, and `Read ... lines 81-100, then read the next page` executes dependent version-checked reads rather than treating the second step as a filename. The following next-page request continues from the second read. Explicit `Review that code ...` now uses the structured review path without requiring a mode toggle; it does not authorize running suggested tests.

New sourceConversationRouting.test.js exercises the real resolver, planner, file tools, evidence retention and conversation engine together. Only model/storage/speech/background scheduling are replaced. It covers the exact reported sequence, failed-first-read stopping, subsequent-page positioning, and topic-change/negation boundaries. It verifies source delivery and routing, not the local model's semantic accuracy.

Retest after restarting the backend in a fresh chat: combined range + next page; `Read out agentProfiles`; the database-failure question; then `Review that code for bugs and suggest tests`. No need to repeat the already-passing controlled-check and persona batch just to validate these routing fixes.

Implemented after the internal-understanding audit:

- `readCode(filePaths, startLine = 1, lineCount = 80, expectedVersion?)` returns numbered lines, a SHA-256 version, and coverage for that read. Maximum 200 requested lines, 8,000 source characters per file, three files per call, and 1 MiB input files.
- Only backend/src JavaScript/JSON source is supported by this reader. Absolute paths, traversal, ambiguous basename matches, and real paths escaping src are rejected. This hardens readCode, not every legacy file tool.
- Empty files are distinct from missing files. Oversized individual lines explicitly remain incomplete; there is no automatic character-offset continuation yet.
- Explicit `Read the code for src/core/contextManager.js lines 81-120` goes through the regular tool permission checks. `Read the next page` uses the previous trusted source read, session/agent filtering and expiry. Changed content aborts continuation. Multiple-file reads do not authorize an ambiguous continuation.
- Background single-file analysis gathers at most three pages / 12,000 formatted characters, checking version consistency between pages. It reports unread coverage rather than claiming a whole-file review. Directory analysis remains the legacy preview path.
- Analysis asks for evidence, counterexamples, minimal proposals, regression inputs and expected outcomes. Source inspection itself never runs tests or applies a change.

The bounded inspect/check/review workflow described below is implemented. It is not an autonomous coding agent: model-selected dependency exploration, generated-test execution and patch application are deliberately excluded. Native thinking and default model promotion remain unchanged.

## Finding-validation follow-up

Background analyze-and-suggest and analyze-and-save now use a bounded structured review:

1. Build a versioned line index from source-tool output. Only completely inspected files receive a parser check (JSON parsing or CommonJS compilation without execution). Incomplete files explicitly skip this check.
2. Request at most four candidate findings with exact filename/line/whole-line quotations, impact, a proposed change, regression input, and predicted result. Invalid citations, malformed responses, and copied schema placeholders are omitted rather than shown as findings.
3. For accepted candidates, run one counterevidence review against the same source and actual parser results. Validate its citations too. Unsupported/malformed reviews withhold candidates; contradicted candidates are withdrawn; unresolved candidates stay unresolved. Supported candidates remain explicitly unverified.

No model-generated code is run, no proposed fix is applied, and parser success never means behavioral correctness. Analysis-mode follow-ups asking for code review/bugs now use this validator; ordinary explanatory follow-ups keep the conversational path. Directory/legacy previews lack versioned line evidence and cannot produce accepted findings here.

## Controlled checks and acceptance handoff

The explicit command `Analyze and test code for src/core/sourceReader.js` (also `Review and test code for ...`) routes directly to the background workflow. It reads source, drafts candidates, runs approved checks, and asks the review pass to revise candidates using actual results. Normal analysis does not authorize behavioral execution.

The developer-maintained registry currently covers four files: sourceReader.js, codeEvidence.js, sourceInspection.js, and validatedAnalysis.js, each mapped to its corresponding offline test file. Unknown files are explicitly skipped. The model cannot select a command, executable, test path or generated program. Checks honor runTests permission; approval-gated checks are skipped, not silently approved. Execution uses Node directly without a shell, a minimal environment, a 15-second per-check timeout, bounded output, cancellation, and source/test version checks. Redirected paths are rejected. These are trusted repository tests, not a sandbox for arbitrary code. Fetch is disabled in their subprocess, but this is not an OS network sandbox.

Actual test status and scope appear separately from proposed tests. Passing a regression contract is not proof that a candidate fix works. The reviewer still must provide valid source citations, and surviving findings remain unverified. Withdrawn/unresolved candidates do not expose free-form reviewer explanations, because a live probe demonstrated that those explanations can themselves invent safeguards.

Validation: 87/87 offline test files, the actual controlled-check subprocess, and 24/24 routing boundaries passed. A live coder run with `auditValidatedAnalysis.js --checks` executed sourceReader.test.js successfully, passed its result into review, and withdrew the remaining candidate. The model's withdrawal rationale was inaccurate; this is recorded as a semantic failure, not a reasoning success. Controlled execution and result routing work; broad semantic correctness is not established.

### User acceptance batch (restart the backend first)

1. `Read the code for src/core/contextManager.js lines 81-100`, then `Read the next page`. Expect numbered bounded ranges and no jump back to line 1.
2. `Analyze and test code for src/core/sourceReader.js`. Expect a background task and an actual sourceReader.test.js result, separate from proposed changes/tests. No code should be applied.
3. `Analyze and test code for src/core/atlasState.js`. Expect an explicit statement that no approved behavioral check is registered, not a fabricated pass.
4. Read agentProfiles, then ask `Based on that code, what happens if the database read fails after a profile was already cached?` Expect an explanation of the branches, not a review-only response.
5. In analysis mode, after reading code: `Review that code for bugs and suggest tests`. Expect citation-checked candidates or an honest insufficient/invalid-evidence result; no claim that proposed tests ran.
6. `Explain how deleting a note works; don't delete anything`, then ordinary game-preference/persona questions. No tools should mutate notes, and normal conversation should stay intact.

Send the replies and background-task result text. Logs are needed only for a missing/failed task, unexpected tool action, timeout, or incorrect test-status claim. All changes remain uncommitted; no migration is required.

Validation: 86/86 offline test files passed. Added tests cover exact/wrong citations, partial coverage, mixed versions, invalid JSON, duplicate/invalid review handling, cancellation, placeholder rejection and compilation without execution. `auditValidatedAnalysis.js` offers local-only clean, known-bug and actual-source probes (`--fixture`, `--bug`, or no flag).

Live results remain mixed: the clean fixture returned no findings. Initial bug probes included incorrect JavaScript claims and review formatting failures. After removing example-value placeholders from the draft prompt and accepting equivalent review-array syntax, the bug probe correctly described the off-by-one access and proposed `<` with a numeric regression input. It still did not explain the original NaN result precisely. An actual source-reader probe invented a missing-error-handling issue and supplied an incorrect line citation; the validator omitted it. This demonstrates containment, not solved reasoning or independently verified defect detection. Independent deterministic audit oracles still confirm the JavaScript behavior.

Validation: source-reader and inspection boundary tests were added to the explicit offline suite; routing tests cover ranges and next-page continuation. Live local-model probes are supplemental, not proof of semantic reliability.

Results: 85/85 offline test files passed; 24/24 reliability-boundary checks passed. The expanded routing test also passed after the multi-file argument fix. One live coder probe (8k context, 1,200 output tokens) failed: beyond the missing `full` keyword, manual review found invented missing-error-handling defects despite guards and catch blocks in the supplied source. Do not promote this coder to trusted autonomous review based on the source-reader changes. Next work should address evidence-grounded finding validation and controlled executable checks, not more default thinking tokens.
