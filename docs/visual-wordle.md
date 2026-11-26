# Visual Wordle: first test version

**Conversational update:** [conversational-task-pipeline.md](conversational-task-pipeline.md) describes the new preparation route and personality-aware response builder. Replay can now reuse the last game monitor, and submitted-guess reports no longer require the exact word `done`. Restart backend and Electron for the protocol update. Historical exact-command instructions below remain supported.

Visual games on empty boards now choose randomly from twelve familiar, vocabulary-checked openers (`wordleOpenings.js`). Each opener is used once per rotation, with no immediate repeat across rotations. Rejected words are excluded, explicit candidate pools are respected, and later turns retain the existing clue-based solver. Re-reading the same empty board keeps the pending guess. Rotation is shared by visual games in the running backend and resets on backend restart; it is not persisted. This is bounded opening variety, not a model inventing a word. Conversational response building and automatic screen monitoring remain separate future work.

## Current reader: measured tile colors

Completed rows now use `backend/src/puzzles/wordlePixels.js`: decode the request-local image with Sharp, locate five aligned square tiles per row using the standard dark/light Wordle palettes, and measure gray/yellow/green backgrounds. It checks spacing and row continuity, rejects partial reveals and ambiguous layouts, then crops/enlarges the grid. Qwen transcribes only the words from that crop. Code attaches measured colors and runs the existing clue/duplicate-letter validation. No OCR model or cloud service is involved. General screen descriptions are unchanged.

If no completed grid can be measured, the older vision path can still identify an empty board or explain a missing/unclear board, but cannot submit model-guessed colored rows to the solver. Standard color themes are supported; high-contrast themes and nonstandard clones may be rejected. Letter recognition still depends on Qwen and can fail. Cropped images remain request-local.

Sharp is now a backend dependency (Node >=20.9). Run `npm --prefix backend install` on a host receiving the update. Mac clients using the Windows backend do not run this decoder locally.

The user's completed SPICY screenshot passed through the real local Qwen reader with all five rows correct. A second live check resized it to the capture path's 1600-pixel JPEG at quality 85 and exercised `done` from the saved four-row state: Alice recognized `SPICY GGGGG`, replied with the win, and ended the visual session. This caught and fixed a JPEG edge-rounding issue. Pixel tests cover both palettes, resizing/JPEG, empty input, partial reveals, missing rows and edge jitter. The historical extraction notes below describe earlier iterations, superseded for colored boards by this pixel reader.

Restart Electron and the backend after updating. Open a standard English five-letter Wordle game with the full grid visible, then say or type:

1. `Start Wordle on monitor 2` (or `Help me play Wordle on monitor 1`). `Start Wordle` uses the monitor containing Alice.
2. Alice reads the board and suggests a word. Type and submit it yourself.
3. Wait for all tile animations to finish, then say `done`. Alice captures the same monitor, reads the submitted rows, and suggests the next word.
4. `Stop Wordle` ends the visual session. Solved/six-row boards also end it. Restarting/reconnecting or switching conversations requires starting visual Wordle again.

Starting visual Wordle adopts the visible board as a new game only after successful validation. This replaces the saved Wordle board in that conversation. Ordinary `Wordle:` commands remain available. Avoid mixing manual board edits with a visual session; restart the visual session afterward.

## Implementation

- `shared/visualWordleIntent.js`: bounded start/read/stop triggers shared by Electron and backend.
- `electron/main.js`: capture on those explicit triggers, pin the physical display ID, and clear routing on stop, game completion, reset, conversation switch or disconnect. Reuses screen capture and OS permission handling.
- `backend/src/puzzles/visualWordle.js`: local Qwen image-to-JSON extraction, strict row validation, monotonic board updates, connection/display binding, permission enforcement, cancellation checks and existing Wordle persistence. Unclear or conflicting reads leave saved clues unchanged. A failed first read can be retried with `done`.
- `backend/src/core/conversationEngine.js`: route visual Wordle before general screenshot descriptions; use existing chat/TTS completion.

Only structured rows are saved; pixels are request-local. No OCR service, cloud model, browser automation, keyboard access, or background capture was added. Qwen reads the tiles; deterministic code picks the guess. Visual suggestions score up to 64 letter-coverage candidates against all matching words in the existing 14,855-word vocabulary. This bounded heuristic is not an optimal solver or a curated current NYT answer list, and may suggest obscure words. Existing manual selection paths are unchanged.

## Validation and limits

`node --test backend/tests/wordlePixels.test.js backend/tests/visualWordle.test.js backend/tests/screenConversation.test.js backend/tests/wordleConstraints.test.js backend/tests/wordleDialogue.test.js backend/tests/wordleConversation.test.js backend/tests/wordleStore.test.js tests/screenAwareness.test.js backend/tests/screenContext.test.js tests/electronClientLifecycle.test.js`

Automated extraction tests use simulated model results. They verify rejection of uncertain, malformed, conflicting and truncated boards; retry; unchanged-board behavior; client/monitor isolation; permission denial; cancellation; solved-state handling; capture routing; and valid deterministic guesses. They do not establish actual Qwen tile-reading accuracy. Live checks should cover empty and partly completed boards, repeated letters, unchanged screenshots, animation timing, both monitors, and stopping.

The first version supports standard B/Y/G tile colors; alternate themes, tiny grids and partially hidden boards may be misread. Structural validation cannot detect every plausible vision error. Alice includes the read words/colors in her reply so errors can be spotted. Enlarge the game if needed and use `start Wordle` to reread a corrected board. No passive watching: each `done` is an explicit new screenshot request.

## Extraction follow-up

Relative starts such as `Lets play Wordle on my other monitor` now enter visual mode. For a new game, “other” is relative to Alice's window, not the last screenshot; ambiguous monitor counts require a number. “This screen” is also supported.

Extraction now uses a JSON schema and asks for literal tile background colors. Code maps gray/yellow/green into B/Y/G. A local Qwen test initially returned incorrect codes for a synthetic SLATE row when asked directly for compact marks; literal color extraction correctly returned BBGBG. Both an empty-grid fixture and that completed-row fixture passed through the final local Qwen extraction path. This is a limited smoke test, not verification of the user's actual game screenshot.

A follow-up test also exposed an invented row on an empty image under direct schema-constrained vision. The final path asks Qwen for literal word/color lines, which code parses directly. Nonstandard responses use a second, text-only JSON conversion with the same model; words absent from the original reading are rejected. The reading is request-local, not saved or logged. Both synthetic fixtures passed the final path; actual game layouts still need live validation.

`[VisualWordle]` logs now include bounded status/reason, monitor, image hash prefix and row count, without pixels or arbitrary model text. Missing grids, small tiles, obscured grids and malformed responses can be distinguished instead of returning the same generic failure. Saved clues remain unchanged on failed validation.

The user's two-row screenshot reproduced a formatting rejection: Qwen emitted `TARE S` with the correct colors, but the JSON conversion joined it to `TARES` and the grounding check rejected it. The direct parser now joins whitespace between exactly five tile letters, preserving spelling, color order and row order. Regression tests reject missing/extra letters and uncertain colors. The supplied screenshot passed through the real local Qwen reader and existing-board validation as `TARES BBBBY`, `SOILY GBGBG`; no screenshot is bundled in the repository.

On a saved-row mismatch, the reader now makes one additional interpretation of the same screenshot with an explicit all-rows/top-to-bottom reminder. Saved words and colors are not supplied to bias that interpretation. A second mismatch leaves the saved board untouched and identifies the row plus saved/new readings in the reply. Tests cover recovery after a bad first read and validation of the user-reported third row `SNIPY GBGYG`. The actual three-row screenshot has not yet been supplied, so its recognition failure is not reproduced.
