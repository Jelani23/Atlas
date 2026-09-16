# Capability and system awareness — September 14, 2026

Implemented on top of the user's personality commit `2dd3c2f`. Alice's accepted personality/profile is unchanged. This work explains current Atlas capabilities; it does not repair all issues in the practical-use transcript or refresh production feature rows.

## Current implementation

- `src/core/capabilityContext.js` supplies a topic-selected operating guide and catalogue. The catalogue checks the actual tool exports, their schema names, ordered argument contracts and current permission policy. It covers 37 schema names, including the existing code-proposal entry marked unavailable because its executable contract is incomplete. Registered tools are explicitly distinguished from successful execution or service health. New exported tools must be covered by the catalogue test.
- The reviewed guide covers notes, code/files/checks, memory, web search, utilities, time, tasks, speech and the main request pipeline. Source references live next to each guide section. Descriptions require maintenance when those implementations change; they are not inferred automatically from arbitrary source code.
- `contextBuilder.js` replaces its stale Supabase world-model capability summary with this local guide. The world_model table is not deleted or changed. General AI model news, ordinary programming questions and personal recall do not receive Atlas context merely because they share a word with a capability. Retrieval is bounded lexical selection, not a new semantic classifier.
- `dev_state` remains the feature-status table in Supabase. Capability questions receive a small budget for relevant entries, with `updated_at` preserved in the prompt. Recorded status is distinct from present code/configuration and last observed health. Older entries cannot override current contracts. No production dev_state updates, schema changes or migrations were performed; auditing/reconciling the outdated rows remains separate work.
- A read-only `ttsManager.getStatus()` exposes configured provider/voice/enabled state and the last observed health result/time. Reading it does not probe a provider, start Kokoro, synthesize audio or schedule work. Unknown readiness is represented as unknown, rather than treating enabled configuration as a successful check. The conversation supplies the selected text model and this snapshot to context assembly.
- Explicit capability questions are prevented from becoming actions in the shared tool boundary. Narrow pipeline questions can reach the operating guide instead of the generic implementation-evidence refusal. Explaining how the knowledge library works is distinguished from requesting its stored contents. Arbitrary schema assertions and actual knowledge lookup keep their existing evidence boundaries.
- Full tool-inventory requests are now answered deterministically from the executable catalogue and permission policy, so Alice cannot invent a generic script sandbox, arbitrary SQL/database-query tool or deployment capability for that question. Specific tool questions still go through the operating guide and model for a natural explanation.

## Validation

All **65/65 offline test files passed after the final changes**, including the final inventory and knowledge-explanation guards. The new checks cover executable/policy mismatches, no stale world-model read, dated dev_state retrieval on the ordinary conversation route, topic exclusions, retained personality, deterministic inventory coverage, and unknown/available/disabled TTS observations without external services. Tool-boundary checks use a mocked executor and verify explanations do not execute or approve actions.

`node scripts/evaluatePersonality.js --capabilities` runs isolated real Qwen 3.5 4B response checks through context assembly, with database access blocked and no tool execution, extraction or TTS. Reports are in ignored `backend/.local/capability-evaluations/`:

- `1789391612701.json`: first pass recovered note instructions, Qwen/Kokoro separation and web search access. Manual review found overstatements of TTS readiness and incorrect memory destination/timing details. Its speech-ownership regex also falsely rejected a correct separation sentence; that check was corrected.
- `1789391699815.json`: 7/8 pattern checks passed after stronger configuration/health and memory-flow guidance. Note instructions required a name and approval; Kokoro was identified separately from Qwen; unavailable/unknown health was acknowledged; automatic multilingual switching was not claimed; web search was recognized. The dated-feature reply described integrated Kokoro and unconfirmed readiness, but omitted the supplied old planned entry, so that comparison check failed.
- `1789392916037.json`: 13/14 isolated model checks passed after the final guide/inventory changes. Note contracts, Qwen/Kokoro separation, health observations, multilingual boundaries, web search, pipeline memory eligibility, append/write semantics, memory eligibility and missing-knowledge handling were clear. The remaining failed pattern was the dated-feature prompt: Qwen still called TTS “running”/“ready” from the local code guide despite an unknown health observation. The deterministic app inventory path is tested structurally, but this harness does not invoke the full `conversationEngine` short-circuit.

These are smoke checks, not factuality guarantees. Manual review also found oversimplified pipeline narration (personality described too early in routing), an unsupported causal link between deletion approval and a missing UI button, and a broad overview that could imply proposal wiring is the only blocker to deployment. Those wording limitations remain open. Prompt/source checks establish supplied information; they do not establish perfect model use of it. The local replay bypasses the full planner and production retrieval, so the app check is still necessary.

## Next app check

Restart Atlas and use a new chat. No SQL is needed. Ask:

1. Can you explain how to delete a note
2. You understand the current state of your TTS right
3. Do you have access to web search or only your training knowledge
4. Explain how Atlas gets from my message to a spoken reply and saved memories

Expect a named-note request plus approval, Kokoro distinguished from the text model with an honest last-health status, recognition of on-demand search, and memory ingestion after the reply rather than only after the chat ends. These are explanation checks: no deletion or web search should execute just from these prompts. Review the replies and logs, especially whether observed runtime status reaches the prompt and speech remains natural. A health observation is not a guarantee of later playback.

## Practical-use findings retained without broader fixes

The user supplied conversation text without backend logs; this supports response-level findings but does not prove which tools ran, which source results were supplied, or what was persisted.

- Search follow-up lost the AI topic and returned vehicle models. Separate work: conversational query resolution and checking result relevance before synthesis.
- Current-news/model answers mixed uncertainty with unsupported specifics and unnecessary Atlas deployment references. Preserve source/date grounding and distinguish public model capabilities from features integrated into Atlas.
- The decision acknowledgment sounded like internal policy text. Separate work: scope the deterministic user-note response so ordinary conversation is not replaced by implementation disclaimers.
- Neuro-sama replies fabricated an open-source TTS identity and licensing/architecture details, then retained part of the false premise after challenge. Separate work: entity identification, correction/retraction, and uncertainty handling. No factual replacement article or model-provider research was undertaken in this change.
- Knowledge-library queries returned generic empty-verified responses or substituted project memory. Separate work: distinguish lookup scope, provisional material, missing retrieval and actual library inventory. The capability guide does not fix those retrieval routes.
- London-time multi-action requests failed; code confirms the time tool accepts IANA identifiers/selected abbreviations but has no bare-city mapping. Separate work: timezone normalization and compound-plan acceptance. The guide documents this limitation; it does not repair it.
- Mixed-language TTS should eventually distinguish speaking original language, romanization and translation according to intent while preserving written text. The existing code has no such switch. A missing translation layer is not a demonstrated cause of the reported character-reading behavior.
- Audible gaps between chunks need timing/audio evidence to locate segmentation, synthesis, buffering or playback causes. Do not treat overlap-add, injected silence or any suggested provider replacement as an established fix. No speech preprocessing, synthesis, playback or language-routing behavior changed here; only status observation was added.

Continue to preserve the outstanding memory comparator limitations (49/61 previously), fresh-session recall acceptance, proposal workflow repair and V1 reliability requirements. Agent-scoped profiles/evolution, contextual thinking modes, broader STT canonicalization and passive topic/news learning remain planned.
