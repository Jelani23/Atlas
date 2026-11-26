# Conversational task pipeline: Wordle adapter

This moves the response-builder work ahead of ESPN expansion. Wordle is the first adapter; ESPN and other existing tools keep their current execution paths. No background monitoring or keyboard control is added.

## Try it

Restart both backend and Electron because the client now uses a preparation RPC. On a connected client:

- “Alright lets play another game of Wordle on my other monitor.”
- After entering a guess: “I entered it, take another look.” (`done` still works.)
- After a game: “Alright, let's play another game.”
- “Cancel that game” or “Stop Wordle.”

A new game defaults to the last Wordle display on this connection. “Other monitor” explicitly means other than the Alice window's display. References to the previous game last thirty minutes and do not cross devices/conversations or survive a backend restart. Explicit numbered/current/other monitor references are parsed from the user's text; the model cannot invent a target. Missing or ambiguous monitors prompt clarification.

## Boundaries and reused code

1. `intent/conversationalTask.js` combines exact command fast paths with local Qwen semantic classification into bounded task/action records. It reuses per-conversation state and permission checks. Game discussion and unrelated messages continue to ordinary conversation/planning; they do not initiate capture. Uncertain classification requests clarification.
2. `devices/clientSession.js` issues a short-lived, single-use preparation receipt tied to the exact message, connection, conversation and scope lifetime. Electron captures the selected physical display. Submission consumes the receipt and verifies that the capture matches its target. Changed messages, wrong monitors, replay, session switches and resets are rejected. Existing voice receipt checks still apply independently.
3. `puzzles/visualWordle.js` executes only the chosen game action, using existing pixel measurement, letter extraction, clue validation, solver and saved-game storage. Permission checks run again at execution. Cancelling deactivates gameplay without deleting the board. Completed games retain only enough context for replay.
4. `response/taskResponseBuilder.js` accepts structured success facts and Alice's existing personality prompt. It has no tool/state access. The model writes a short response with placeholders; code inserts the verified word/count. Output checks reject missing facts, substituted uppercase words, unsupported device/tile claims, premature victory and malformed output. Model failure or failed checks retain the deterministic reply. This is bounded presentation validation, not a guarantee against every possible misleading sentence.
5. `core/conversationEngine.js` runs the task adapter before general screenshots/planning and sends the final response through normal chat history/TTS. Unclear reads and permission failures remain deterministic and explicit.

On screenshot-capable clients, `planner/planner.js` no longer falls through to `wordleDialogue` for natural-language requests. `tools/puzzles/puzzleHelper.js` independently blocks model-invented manual Wordle commands unless the user's original message explicitly began with `Wordle:`. Explicit manual commands and nonvisual clients retain their previous interfaces. Screen inventory and client identity remain self-reported, not authentication credentials.

## Verification and limitations

`backend/tests/conversationalTask.test.js` covers semantic actions, retained targets, prevention of model-invented monitor switches, permission denial, cancellation, response validation/fallback, single-use receipts, wrong displays, conversation switches and resets. Electron lifecycle/transport and screenshot conversation tests cover preparation-before-capture, message binding, personality presentation and normal speech routing.

Live local-model checks exercised replay, a submitted-guess follow-up, cancellation, a strategy question and an unrelated fantasy request. These revealed and fixed a model-invented monitor switch and a premature congratulation. Generation can still fall back to the checked deterministic message. Semantic classification and presentation add local model latency. Full interactive multi-device game testing remains a user live test; the local checks do not establish universal language understanding.

Future adapters should return a bounded task action, deterministic result facts and a validated response contract. Do not route unrelated tools through Wordle state or give the response builder execution authority. Passive board watching is a separate future feature.
