# Shared project questions and fresh-file analysis evaluation

## Implemented

Ordinary questions naming one `src/...js` or `src/...json` path now enter a shared read-only path before ordinary conversation generation. No per-filename answer logic exists. Explicit Learn/Recall/Check commands retain their existing behavior. Obvious action requests such as “Can you delete …” and “do not read …” are not taken over.

`reasoning/projectQuestion.js` reads the current complete source through the restricted source reader, retrieves the same agent's exact Atlas/file record, excludes source-stale records, and includes current checked observations only when their source/test fingerprints still match. Up to four source-current stored observations are supplied as explicitly unverified hints, not trusted facts. Their model/method quality is not certified even when source is unchanged. Database read failure falls back to current source with an explicit notice; identity mismatch fails closed.

The model sees current source, the user's question, and distinctly labeled saved interpretations/checked results. It returns bounded claims with source-line references and missing-evidence statements. References must exist, but this is not semantic validation. Source is reread after generation to reject answers produced across a source edit. Answers use the ordinary configured general model, thinking off, temperature 0, 900 output tokens, 8192 context and a cancellable 45-second deadline. No retries, generated tests, knowledge writes or automatic promotion to verified status occur.

Explicit “that file/function/code” follow-ups reuse the selected file and original user question within the same session/agent for ten minutes, while rereading source. Prior assistant answers are not used as implementation evidence. Topic changes, explicit knowledge commands and session closure clear this reference.

## Scope limits

This is direct file retrieval, not semantic project-wide search. The user names a source path initially; no implicit active-project root switching, basename resolver or cross-file dependency walk was added. The existing Atlas-only filesystem boundary and complete-file budget (200 lines / bounded numbered read) apply. Large or partial files are declined rather than treated as complete. The first pass does not guarantee comprehension of every supported file or multi-file questions.

## Evaluation

Six new questions across `keywordExtractor.js`, `recovery.js`, and `projectExtractionScope.js`, with missing, source-current/unverified and stale synthetic records. Fixed author-written oracles execute the real functions; the model never sees those expected answers. The audit uses the real question service/source reader with isolated retrieval. Separate real-conversation tests cover routing and multi-turn state. Model calls are sequential; no production data was written.

Report: `backend/.local/project-question-audits/1790173274714.json`.

Manual review:

| Question | Actual outcome | Answer assessment |
| --- | --- | --- |
| Keyword purpose + `Can cats cats fly?` | Set containing cats and fly | Purpose and deduplication explained, but omitted fly. |
| `foo-bar CAT` | foobar, cat | Correctly said punctuation is removed, then incorrectly omitted foobar. |
| Recovery on length termination / empty reply | true, true | Inverted the empty-reply condition; predicted false for empty reply. |
| Long overlap / below-minimum short overlap | ` tail`, `lo again` | Dropped leading whitespace and incorrectly removed a disallowed short overlap. |
| Unrelated Redis mention with beta active | no projects | Correct result and central ownership distinction. Some contextual-pattern examples were imprecise. |
| This project / Alphabet | beta / none | Correct selections; loose prose described OR matching as an override and speculated about aliases absent from the scenario. |

All six calls completed structurally. Four gave wrong exact outcomes; the two ownership cases gave correct selections with qualifications about explanation quality. Citation existence, retrieval completion and fluent prose do not establish accurate analysis. This is a small first exposure to these questions, not broad model certification, and no answers were tuned to match them afterward.

Reproduction: `node scripts/auditProjectQuestions.js` from backend.

## Validation and live gate

95/95 offline test files passed. Targeted question/retrieval and real-conversation tests passed again after adding original-user-question carryover and checked-evidence freshness coverage. Tests cover missing/stale/unavailable storage, agent isolation, checked-evidence exclusion, no writes, malformed citations, source changes, cancellation/deadlines and topic switching.

Restart the backend, then try ordinary questions without Learn first:

1. `How does src/utils/keywordExtractor.js turn text into searchable keywords?`
2. `What does that file do with repeated words and punctuation?`
3. `How does src/response/recovery.js decide whether a response needs recovery?`

Look for the right file on follow-up, source citations and explicit limits. These prompts test the shared route and analysis quality, not a claim the model will answer correctly. No new SQL/settings are required. Existing stored knowledge and checked outcomes are unchanged. No commits made.

Next decision should address the cross-file reasoning failures shown here rather than add special cases for these questions. Retrieval now provides an inspectable evidence packet; analysis accuracy is still an open gate. Background scanning and trusting generated summaries remain deferred.

## Spoken questions follow-up

The latest live run completed the keyword explanation but timed out on both subsequent questions at the existing 45-second model deadline. Root cause is not established by those logs. The first answer was broadly consistent with source, but repeated filtering details and did not explicitly explain deduplication or punctuation joining adjacent letters.

Ordinary questions now match camel-case, spaced and basename references against the current source index, using the existing restricted reader. Common single-word names require a file/code/module cue. Duplicate names return a clarification; mentioning the folder can distinguish them. No guessed fuzzy matches or file-specific answers. This remains Atlas source lookup, not arbitrary conceptual search or a guarantee of handling every voice transcription.

Project question TTS now receives the answer claims and a short uncertainty statement; on-screen replies retain citations and storage details. Existing other command presentations are unchanged. Original claim prose is still model-generated and may contain technical terms.

Model-stage duration/abort/return state is logged without prompt contents, and request IDs reach provider metrics. Cancellation wiring was already present. Deadline remains 45 seconds; no retry or global model policy change. These diagnostics do not fix or establish the cause of live timeouts.

Validation: targeted project question tests and real conversation routing tests passed, including spoken names, ambiguous names, folder qualification, ownership/expiry, deadline cancellation and separate TTS output. No new live model evaluation performed in this follow-up.

Restart and say: "How does the keyword extractor work?", then "What does that file do with repeated words and punctuation?", then "How does the recovery file decide whether a response needs recovery?" If it times out, retain the new ProjectQuestion timing line and provider metrics. No migration or commits.
