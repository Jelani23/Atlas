# Atlas Target Pipeline and System Architecture

> Status: future-state architectural blueprint. This document is a design reference, not a claim that every component is implemented. Changes should be introduced incrementally and verified against the current codebase.

## Core flow

`User / world -> real-time perception -> asynchronous preparation -> working cognitive state -> memory retrieval -> knowledge and uncertainty model -> cognitive controller -> final intent and risk gates -> task/action engine -> observe/verify loop -> communication`

Memory consolidation runs asynchronously after conversations, tasks, tool results, and decisions, making durable information available to later cognition.

## 1. Real-time perception layer

Inputs include voice, text, UI interactions, devices, files, tools, and environment state.

- Streaming/partial speech-to-text emits words incrementally.
- Partial semantics identifies intent candidates, entities, targets, constraints, and confidence.
- The event bus carries `user_input.partial`, `user_input.final`, `tool.result`, `device.event`, `task.update`, `memory.result`, and `system.alert`.
- A speech interruption and priority manager decides whether Alice should wait, shorten, interrupt, or resume.

## 2. Asynchronous preparation / front half

The speculative work manager follows one central rule: **prepare, do not commit**.

- Intent resolver: request type, likely goal, and confidence.
- Context resolver: active project, current task, and active files.
- Capability resolver: target device, available tools, and permissions.
- Risk classifier: consequence, reversibility, and sensitivity.
- Memory prefetch: retrieves likely relevant memory before the final request.
- Environment probe: checks files, application/process state, and device status.
- Outputs are a candidate plan and prepared read/inspection actions. Mutating actions still require authorization appropriate to their risk.

## 3. Working cognitive state

Working context tracks:

- active project and task;
- active files;
- conversation focus;
- current entities and constraints;
- unresolved questions;
- confidence state;
- recent tool results.

## 4. Superhuman memory retrieval

A retrieval router can draw from separate memory domains:

- User memory: preferences, history, relationships, and habits.
- Project memory: architecture, decisions, features, and issues.
- Knowledge library: world facts, researched information, assumptions, and sources.
- Episodic/conversation memory: chat events, prior sessions, and temporal recall.
- Procedural memory: trigger-to-action rules, workflows, and learned routines.
- Development state/history: implemented work, known issues, failed attempts, and future work.
- Reflections/summaries: distilled meaning and long-session continuity.
- Task memory: task state, dependencies, checkpoints, and resume state.
- Relational/pattern memory: cause and effect, comparisons, and learned patterns.

Retrieval scoring considers relevance, confidence, recency, source quality, contradiction state, and project isolation.

## 5. Knowledge and uncertainty model

Alice must distinguish what is reliably known, what needs verification, and what remains uncertain.

- Reliably known: directly observed or externally verified.
- Needs verification: stale memory or conflicting sources.
- Uncertain: inferred or unknown.

Verification policy chooses among direct use, cheap verification, deeper research, asking the user, or admitting uncertainty.

## 6. Cognitive controller

Reasoning mode is selected from complexity, uncertainty, and consequence:

- Fast: casual/simple requests, deterministic work, or known answers.
- Normal: ordinary requests and moderate tool use.
- Deep: difficult analysis, debugging, planning, and complex synthesis.
- Deliberate/high-risk: verify before acting.

Atlas maintains one authoritative cognitive thread that reasons, decomposes tasks, resolves ambiguity, selects knowledge, and decides which model calls are necessary.

## 7. Intent finalization and gates

After the user utterance is complete, Atlas checks that the goal, constraints, and targets are stable. The action risk gate then classifies execution:

- Safe/automatic.
- Reversible/medium risk.
- High risk, requiring explicit confirmation such as confirming a deletion or purchase.

## 8. Task and action engine

The task manager owns the objective, plan, checkpoints, dependencies, execution mode, and progress detail.

Execution modes include background, visible, collaborative, and teaching. Detail levels include minimal, semantic, detailed, and step-by-step.

The capability router dispatches work to the appropriate device agent:

- Home-PC agent: filesystem, terminal, applications, and code execution.
- Mac/device agent: application control, files, notifications, and screen access.
- Phone/other devices: camera, location, shortcuts, and other device-specific capabilities.

Tool execution emits asynchronous events back into the system.

## 9. Observe and verify loop

After every meaningful action, Atlas observes the result and determines whether it worked. Successful steps continue the task. Failures or unexpected state return through the event bus, trigger cognitive reevaluation, and revise the plan before execution continues.

## 10. Communication layer

- Responses are generated and streamed incrementally.
- Sentence chunks feed a streaming TTS queue.
- Speech is interruptible and priority-aware.
- UI state represents Alice's cloud/emotion, task progress, and status.

## 11. Asynchronous memory consolidation

Conversation, task, tool, and decision events pass through:

1. Eligibility gate: decide whether the event is worth remembering.
2. Meaning extraction: deterministic first, with an LLM when necessary.
3. Domain classification: user, project, knowledge, episodic, procedural, reflection, relational, task, or development state.
4. Conflict and deduplication: insert, update/upsert, merge, supersede, record contradiction, lower confidence, archive, or forget.
5. Long-term storage, available to future cognition through the retrieval router.

## Architectural invariants

- Speculative work may prepare but must not commit actions prematurely.
- One cognitive thread remains authoritative even when preparation and execution are asynchronous.
- Memory domains remain distinct and project-isolated.
- Retrieved claims carry confidence, provenance, freshness, and contradiction information.
- High-risk actions require verification and explicit user confirmation.
- Tool success is never assumed; Atlas observes and verifies outcomes.
- Communication and memory consolidation can stream or run asynchronously without corrupting the authoritative task state.
