# Manual regression results and deferred voice/router work

The user's latest new-chat test confirmed precise retrieval for explicitly typed macOS instance handoff and Ollama model-support queries, provisional labeling without web search, Magnolia/Willow recall with follow-up scope switching, and the symbolic two-task calculation/word-count request.

These were not a full pass for natural spoken wording:

- `Reach the Knowledge Library for Ollama Dark Support` returned the dark-mode claim plus unrelated Qwen support. Missing words weaken precision; this is also a retrieval relevance issue, not exclusively STT.
- Transcriptions such as `Olamah`, `Olama Mac OS`, and `Ola Maquinn` missed intended entities. Future entity resolution should be uncertainty-aware rather than blindly rewriting similar names.
- `Calculate 18 times 7 and then the word count of memory systems need careful grounding` executed only word count. The input has two understandable actions: this is a planner coverage failure, not merely speech transcription. Preserve it as a regression case for all-or-clarify multi-action routing.
- A garbled repeated-word message triggered a synthesized claim about Atlas's infrastructure and the phrase `I couldn't verify this online` without a logged search. Unclear input should invite clarification, not unsupported implementation claims or implied tool activity.

No STT/router changes were made in the review-resolution pass. These observations are deferred, not marked fixed. Memory extraction skipped the garbled turn in the provided logs; this does not prove every later reflection or other memory path excludes its assistant assertions.
