# Manual regression results and deferred voice/router work

## September 13 direction and bounded progress

The user expects voice to become the preferred/main input method. App acceptance tests must include ordinary speech with no punctuation dependency, spoken numbers and natural command boundaries. Keep broader STT canonicalization on the roadmap: uncertain entity names, number/unit transcription, omitted punctuation, fillers, self-corrections and preservation of every requested action. Retain raw transcripts and uncertainty; do not silently guess consequential targets from similar-sounding names.

The planner already segments `and then` without punctuation. New local-model fixtures use `Calculate two plus two and then give me the word count of hello world` and `Convert five kilometers to meters and then count the characters in Atlas`. They exposed a calculator-input issue: the model copied spoken arithmetic verbatim. Added a bounded tool-specific arithmetic normalizer for numeric notation, common English cardinals through 999 and plus/minus/times/divided-by. Unknown wording is rejected instead of stripped into a different calculation. Text arguments to other tools remain unchanged. This is not broad STT correction, and spoken thousands/decimals or arbitrary verbal formulas are not supported by the deterministic helper.

All 58 offline files pass, including actual calculator outputs for spoken inputs and rejection of malformed wording. Local model proposals plus actual compilation pass 13/13 (`1789311571353.json`), including both punctuation-free requests. These fixtures simulate transcript text; microphone/STT/TTS delivery still needs app-level validation. The earlier entity errors and dropped-action reports below remain historical acceptance cases, not proven fixed by this smaller suite.

The user's latest new-chat test confirmed precise retrieval for explicitly typed macOS instance handoff and Ollama model-support queries, provisional labeling without web search, Magnolia/Willow recall with follow-up scope switching, and the symbolic two-task calculation/word-count request.

These were not a full pass for natural spoken wording:

- `Reach the Knowledge Library for Ollama Dark Support` returned the dark-mode claim plus unrelated Qwen support. Missing words weaken precision; this is also a retrieval relevance issue, not exclusively STT.
- Transcriptions such as `Olamah`, `Olama Mac OS`, and `Ola Maquinn` missed intended entities. Future entity resolution should be uncertainty-aware rather than blindly rewriting similar names.
- `Calculate 18 times 7 and then the word count of memory systems need careful grounding` executed only word count. The input has two understandable actions: this is a planner coverage failure, not merely speech transcription. Preserve it as a regression case for all-or-clarify multi-action routing.
- A garbled repeated-word message triggered a synthesized claim about Atlas's infrastructure and the phrase `I couldn't verify this online` without a logged search. Unclear input should invite clarification, not unsupported implementation claims or implied tool activity.

No STT/router changes were made in the review-resolution pass. These observations are deferred, not marked fixed. Memory extraction skipped the garbled turn in the provided logs; this does not prove every later reflection or other memory path excludes its assistant assertions.
