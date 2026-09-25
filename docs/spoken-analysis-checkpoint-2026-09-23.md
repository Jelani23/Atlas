# Spoken opt-in analysis checkpoint

## User-visible path

Start with "Analyze the keyword extractor" or "Analyze the word count file". Existing file-name resolution accepts spoken aliases and explicit paths. Ordinary named-file explanation questions retain their previous direct-source path. Analyze opts into the evidence bundle; same-agent, unexpired "that file/function/code" follow-ups retain the mode and selected function. Unrelated turns clear the context. A fresh named-file question without Analyze returns to ordinary mode.

Target selection uses a unique top-level function matching the file stem, or the sole top-level function. Ambiguous files request a function name. An explicit "function should recover response" clause matches camelCase names conservatively. No inferred nested targets.

Optional inputs use "with text set to hello", or "with value set to 7kg and total set to 14". Parameter names must match the selected function; duplicates/unknown names fail before generation. Bare text is a string, exact true/false are booleans, and plain decimal numerals are numbers. JSON quoted strings preserve internal whitespace and separator-like text. Spoken number words remain strings; no speech-to-number guessing is implemented. Bare trailing punctuation is part of the value; the on-screen Inputs understood section exposes the exact parsed values and types. Unsupported primitive operations stay unknown. Follow-ups do not inherit argument values silently.

The input record identifies explicit assignments separately from extracted quotations, retaining the raw assignment text. Primitive rules accept bounded string/number/Boolean primary inputs as well as explicit additional arguments. No input can execute code.

Known source paths accidentally embedded in model prose are replaced with spoken file names for TTS, while display citations remain intact. No global model policy or background work was enabled. No migration or production knowledge write is required.

## Validation

103/103 offline test files passed: backend/.local/spoken-analysis-tests.log. Real conversationEngine integration checks use real routing/source access/session scoping with model/storage/background work stubbed. They cover spoken opt-in, follow-up scope without argument carryover, ordinary-mode return, and speech citation exclusion. Parser/service tests cover explicit typed inputs, quoted separator text, ambiguous/invalid names, agent and expiry isolation, and derived branch selection.

After the full suite, display input echo and known-path speech replacement were added; spokenAnalysis, projectQuestion and sourceConversationRouting targeted tests passed again. Whitespace diff checks passed.

Four sequential real local model turns: backend/.local/spoken-analysis-audit/1790218471499.json. These use real file resolution and question service, with read-only null knowledge storage; they do not invoke production memory or speech. Keyword extractor hello selected the correct branch and predicted the correct Set. Its punctuation/repetition follow-up omitted duplicate handling and described whitespace imprecisely as spaces. Word count hello world predicted 2 correctly; its missing-input follow-up described the catch path but remained generic. All completed within the deadline. These are limited positive routing observations, not proof of deep or comprehensive explanation accuracy. The branch validator still does not certify arbitrary prose or whole-function results.

## Live acceptance

Restart the backend, then use these in sequence (spoken first if convenient):

1. Analyze the keyword extractor with text set to hello
2. What does that file do with repeated words and punctuation?
3. Analyze the word count file with text set to hello hello world
4. What does that file do if the input is missing?

Check the recognized words, selected file/function, displayed Inputs understood, preserved follow-up context, useful speech without full source paths, and whether the answer actually covers the question. The third input should have three words. The second should explain Set deduplication and punctuation removal before whitespace splitting. Missing wordCount input causes trim to throw and the catch returns an error string; it is not a zero count. These are manual source expectations, not runtime observations from this live analysis feature.

Stop for these live results. Do not tune repeated wording or expand into an arbitrary interpreter before evaluating this checkpoint. User handles commits.
