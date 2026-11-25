# Deep-analysis preview and live interface checkpoint — 2026-09-27

Latest continuation: [follow-up fixes and six-prompt live batch](deep-analysis-batch-checkpoint-2026-09-27.md). That checkpoint supersedes the contract version and presentation described below; prior experiment results remain historical evidence.

## Live-test follow-up: file clarification fixed

The user's first live test found both `src/tools/writing/extractKeywords.js` and `src/utils/keywordExtractor.js`. The clarification “The one in utils” then fell out of the source-question route because the pending choices were not retained and the choice response was not recognized. The ambiguity response also discarded deep-analysis mode. Subsequent prose invented an options-object signature and an array return; those claims do not describe the selected utility.

The detector now preserves the original question and mode while a file choice is pending. It accepts a unique offered folder, basename or exact path, including “The one in utils.” Unresolved choices are re-asked; removed files, ownership, expiry and unrelated requests cannot silently select a source. A same-file question before selection re-asks for the file. The engine stores the pending request in the existing conversation scope, which is cleared on closure.

The complete ambiguity → folder selection → punctuation follow-up sequence passes an engine-level offline test with the real source service and a stubbed model. No model call occurs before selection; both later calls receive only the selected utility source and retain thinking-enabled deep mode. **118/118 offline files passed**, plus focused checks after the final pending-reference guard. No new model call, production writes or commits were needed for this routing fix.

After restarting, use **“Deep analyze the utils keyword extractor file function extract keywords.”** to test the analysis directly. To test the clarification repair, repeat the original ambiguous request, answer **“The one in utils,”** then ask the punctuation follow-up. The response after selection should have the experimental deep-analysis label. The utility accepts `text` and returns a Set, not an options object/array API. Semantic quality remains unverified.

The JSON-extractor channel-limit message behaved as intended in the user's live test and does not need repeating for this fix.

## Current boundary

An explicitly requested **Deep analyze** command now reaches a thinking-enabled, local-only analysis preview. This is ready for live **interface** acceptance: command recognition, scoped follow-ups, screen/speech presentation and cancellation. It has **not passed whole-answer semantic accuracy**. It must not be promoted to trusted project knowledge, automatic learning or a replacement for the existing deterministic Analyze path.

Normal conversation and ordinary Analyze retain their previous model policy. No model settings file was changed. The configured general model remains the deep preview model (qwen3.5:4b in this environment). The larger-model and sampling-setting experiments below were audit-only.

## Implementation

- `deepAnalysisContract.js` defines a bounded JSON contract for cited claims, assumptions, proposed unknowns and predicted examples. Atlas assigns MODEL_INFERRED status and current source versions; the model cannot self-award verification. Invalid structure, extra fields and nonexistent citations are rejected. Empty and whitespace-only example values are preserved. Invalid JSON errors do not echo snippets of potentially leaked drafting.
- A source-first model view preserves every source character while separating source structure, call relationships and analyzer limitations. The original detailed packet remains available in audit artifacts. This reduces distracting repeated metadata without deleting source context. Source-view/contract version is `deep-analysis-contract-2`.
- `deepAnalysis.js` uses complete versioned source, fresh-source checks before and after generation, a 10-minute timeout, 16,384 context tokens and 12,000 shared thinking/output tokens. It rejects overlapping deep requests and does not release the lock while an aborted provider call remains unsettled. Cancellation is polled and propagated to the local request.
- The response inspector is shared from `src/reasoning/deepAnalysisResponse.js`; the original script import remains a compatibility wrapper. Completion metadata, schema validation, channel review and semantic trust remain distinct. Native thinking is counted and never retained.
- Source or questions containing known literal thinking/tool-call tags are rejected before generation on this experimental provider path. No source or output stripping is used to pretend these cases succeeded. The rejection is a provider limitation, not a missing-source claim.
- Screen output separates the host's source inventory, recorded dependency gaps, omitted analysis records and analyzer limitations from model interpretations and model-proposed open questions. Speech gives a shorter unverified summary and directs the user to detailed examples on screen.
- `projectQuestion.js` recognizes “Deep analyze,” “Deeply analyze,” “Analyze deeply” and “Analyze in depth.” Same-file follow-ups retain deep mode, agent ownership, target and expiry. Explicit ordinary Analyze exits deep mode. The deep branch does not open stored project knowledge.
- `conversationEngine.js` supplies the local provider envelope API and retains deep follow-up scope. Cancelled or closed deep requests do not emit a late completed reply, append a late assistant message or enqueue speech. Ordinary successful live replies still use the normal conversation transcript; this is separate from project-understanding storage. The development audits did not write to that transcript or production databases.
- `ollama.completeEnvelope()` exposes metadata for the new route while `complete()` retains its existing string-return API. Normal streaming behavior is unchanged.
- Audits gained structured-output comparisons, source encoding and sampling controls, held-out recovery/keyword cases, local model selection, and graceful cancellation checkpoints. These are explicit offline commands; none run in the background.

## Actual experiments and findings

All local model calls were sequential. Artifacts are under `backend/.local/deep-analysis-audit/`.

| Artifact | Experiment | Finding |
| --- | --- | --- |
| `channels-1790539563675.json` | Structured JSON, ordinary versus literal-tag source | Ordinary passed; the tag case returned valid JSON with the wrong value. Syntax alone is insufficient. |
| `channels-1790539597017.json` | Reversibly encoded source, 2,048-token budget | Ordinary passed; the tag case exhausted the budget with empty content. |
| `channels-1790539718744.json` | Encoded tag case, 8,000 tokens and 16,384 context | Completed but returned the wrong tag string. Encoding was not adopted as a fix. |
| `channels-1790540240573.json` | Structured output with presence penalty zero | Ordinary control exhausted 8,000 tokens; tag case matched. This policy was not adopted. |
| `1790539864550.json` | Recovery function, full packet, structured thinking | Incorrect falsy-input prediction and missing-source claims about built-ins. |
| `1790540052598.json` | Recovery function, source-first view | Prompt fell from about 9,342 to 2,021 tokens on the overview. Detail improved, but incorrect falsy-input and early-return explanations remained. No semantic pass. |
| `1790540434648.json` | Installed qwen3:8b, keyword extractor | Misread whitespace handling, invented missing evidence and gave incorrect examples. Also exposed an overly strict whitespace-example validator, now fixed. No model switch was adopted. |
| `preview-1790559548178.json` | Final command/service/provider route, configured 4B model, initial turn plus scoped follow-up | Both returned structurally valid, cited, explicitly unverified analyses in about 29.6 and 91.7 seconds. Follow-up correctly predicted punctuation merging and null's empty Set, but wrongly predicted an empty Set for numeric 7; actual behavior is TypeError. Overview examples also contained errors. |

The installed provider reports Ollama 0.34.4. Its [version-matched Qwen 3.5 parser](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/model/parsers/qwen35.go) changes from thinking to content when it encounters a closing thinking tag. This is consistent with the observed mid-fragment output; the experiments do not fully isolate model generation from provider parsing. General streaming compatibility was not investigated in this pass.

## Verification

- **118/118 offline test files passed** with network access disabled by the suite harness.
- Final focused contract, service and conversation-route tests passed after the presentation/error-message adjustments.
- Coverage includes source freshness, malformed/partial responses, invalid citations, unchanged literal data, no retained native thinking, same-file scope, ordinary/deep mode separation, timeouts, cancellation and non-overlap.
- Engine-level fixtures verify actual routing into the deep service, no stored-project-knowledge lookup, and no late assistant transcript write, completion event or speech after task cancellation or conversation closure.
- Real local-provider preview calls exercised the same detector/service/provider path with no production database access. Fixed reference calls used only inspected, authored pure utilities; no generated tests or model-generated code were executed.
- Existing uncommitted work was preserved. No commits, migrations, production database writes during validation, autonomous patches or background learning were performed.

## Live interface test — next user action

Restart the backend and open a fresh Alice conversation. Allow the deep call to finish; this route is deliberately slower than ordinary Analyze.

1. Say **“Deep analyze the keyword extractor file function extract keywords.”**
   - Expect an experimental/unverified label, separate source/analyzer/model sections and citations on screen.
   - Speech should give a shorter summary without paths, source line numbers, JSON scaffolding or drafting.
   - Backend stage should be `deep_model`. No claim of tests run or knowledge learned/saved.
2. Ask **“What does that function do to punctuation?”**
   - Expect the same function and file to stay selected, with another unverified analysis.
   - Correct behavior removes punctuation rather than inserting word boundaries, then splits on retained whitespace. Treat a contrary explanation as an accuracy failure; do not approve it merely because citations exist.
3. Say **“Deep analyze the JSON extractor file function extract JSON.”**
   - Expect a clean provider/channel-tag limitation message before a model call, with no drafting or truncated explanation.
4. Start another deep analysis, then start a new conversation while it is running.
   - Expect cancellation and no late speech or completed analysis arriving in the new conversation.

These checks establish the live boundary, not general reasoning quality. The numeric-7 error and other semantic failures are already recorded; there is no need to rerun them merely to rediscover them. Automatic persistence, recall integration and background analysis remain gated on a separate accuracy/acceptance milestone. Audit artifacts checkpoint progress but do not yet provide automatic resume/retry.
