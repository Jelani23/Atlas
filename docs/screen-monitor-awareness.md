# Phase 2 — Screen and monitor awareness

## Implemented behavior

The local Electron client inventories its connected monitors for each text/voice submission. Alice receives display names/IDs, logical dimensions, scale factors, rotation, primary display, and the display containing Alice's window. This does not identify the user's gaze or another application's focused window. Metadata is a per-interaction snapshot, not backend-host monitor data or durable memory.

The chatbar's **paperclip → Screen** menu opens a monitor selector and question field in both Home and Conversations. **Share one screenshot** captures exactly the chosen screen directly, and sends it through the existing WebSocket connection. Displays are numbered and positioned relative to the primary screen so identical monitor names remain distinguishable. The last successful selection is remembered for this client session. Reopening the menu shows the last captured image and monitor/time, allowing verification independently of Alice's interpretation.

Requests such as **“Can you tell me what's going on in my screen?”**, **“Describe my screen”**, **“Look at my screen”**, and **“Take a screenshot”** use the selected monitor (or the display containing Alice if none has been selected). Append **“on monitor 2”** to target the second display shown in the menu; these numbers are Atlas's enumeration, not necessarily Windows Settings numbering. The same phrases work through STT. Capability questions such as “Can you see my screen?”, negated requests and instructions about how to take screenshots do not capture anything.

Explicit typed/voice screen requests and the Share button now capture directly, as requested by the owner. ATLAS no longer presents per-capture or session-access dialogs, and the session permission checkbox/RPC has been removed. OS Screen Recording permission remains enforced. The renderer cannot supply screenshot pixels through IPC; requests cannot target another device or silently fall back to another monitor. A connection change during capture cancels submission. There is no background capture, and model output never triggers capture.

On macOS, enable Screen Recording for Electron/Atlas when prompted; after changing permission, restart the client. Denial, missing sources, and capture timeouts produce explicit errors. Some desktop systems do not supply display-to-source mappings; capture fails rather than guessing. Monitor inventory remains available without recording pixels, and inventory failure does not block ordinary chat.

## Model and data flow

Pixels remain separate from public interaction metadata. The backend validates the inventory, image size/type, capture age, and selected display before attaching the image to a single conversation-engine invocation. Alice's existing personality compiler is retained. Fresh vision requests receive only the validated capture-source monitor number, not the full competing monitor inventory, retrieved memory, or previous visual descriptions. A separate local vision step checks Ollama's model capabilities and sends the image in the REST `images` field. `OLLAMA_MODEL_VISION` overrides the model; otherwise it reuses the configured general model, defaulting to `qwen3.5:4b`. Ordinary model routes are unchanged. There is no cloud fallback or automatic model download.

The screenshot path invokes no tools and schedules no knowledge extraction from the image. Text inside screenshots is treated as untrusted evidence, not instructions. The usual reply and TTS completion path presents the model's answer. Pixels are not written to disk, conversation history, backend event broadcasts, logs, or the memory extraction pipeline. A local-only Electron event supplies the submitting client's in-memory preview; it is cleared when that chat input view unmounts. Capture logs contain only display/source IDs, label and image hash prefix. The question and textual answer are saved through the existing chat-history path and may therefore participate in existing later session reflection. Existing textual-response/audio broadcasts still apply; this phase does not implement client output isolation.

Screen sharing is a one-shot observation, not continuous recording or screen control. Images are reduced to a thumbnail requested at up to 1600 × 1000 and encoded as JPEG; very small text may be unreadable. Native capture waits at most 20 seconds; local model analysis waits at most 90 seconds. Selecting a display uses the Electron display ID, never a guessed list index. Camera access, focused-app inspection, automatic clicking, visual Wordle feedback ingestion and solving are deferred.

## Changed files

- `electron/screenAwareness.js`: display inventory, conservative explicit-command recognition, native consent and exact-display capture.
- `electron/main.js`, `electron/preload.js`, `electron/clientIdentity.js`: local IPC, screenshot capability registration, origin-connection checks and per-message monitor metadata.
- `renderer/components/screen-control.tsx`, `renderer/components/atlas-app.tsx`, `renderer/lib/atlas-events.ts`: Screen UI and typed bridge interface.
- `backend/src/devices/screenContext.js`, `clientSession.js`, `interactionContext.js`: validation, separate private image attachment, and prompt context.
- `backend/src/devices/screenAnalysis.js`, `backend/src/interface/atlasInterface.js`, `backend/src/core/conversationEngine.js`: local vision-only analysis with existing character context, reply storage and speech.
- `tests/screenAwareness.test.js`, `backend/tests/screenContext.test.js`, `backend/tests/screenConversation.test.js`: consent, isolation, model gating and conversation integration checks. Existing device/lifecycle fixtures were updated for screen capabilities.
- `backend/scripts/checkScreenVision.js`: explicit JPEG-fixture smoke check with no desktop capture or history writes.
- `renderer/components/chat-input.tsx`, `home-view.tsx`, `conversations-view.tsx`: paperclip menu and selected-display option propagation.
- `scripts/inspectDisplays.js`, `scripts/checkDisplayCapture.js`: explicit live diagnostics for metadata mapping and synthetic per-monitor pixels; neither saves screenshots or contacts the backend/model.

## Validation

Passed `npm run test:screens` (three suites), `npm run test:launch` (three suites), and eight existing device, context, transport, conversation, permission, Wordle and ESPN regression files. Renderer TypeScript and JavaScript syntax checks passed.

A live local Ollama smoke test used a generated 800 × 500 JPEG, not the desktop. `qwen3.5:4b` correctly read **ATLAS SCREEN TEST**, **CODE 4827**, and a **blue rectangle** in about 35.6 seconds. This verifies actual image interpretation through the new local analysis path; it does not verify macOS screen permissions or live desktop capture.

Follow-up investigation on the user's PC found two identically named EK240Y monitors with distinct IDs. A live synthetic color-window test verified `233511306 → screen:0:0` and `3642003761 → screen:1:0`: each captured exactly its expected red/blue center pixels. A swapped source mapping was not reproduced. The fixes address ambiguous labels and possible prior-description anchoring, and add previews/hashes to make any remaining selection discrepancy observable. Regression tests also reverse capture-source enumeration and verify distinct images, direct requests without popups, OS permission denial and monitor removal.

## Live acceptance check

Conversational lead-ins such as “Alright”, “Okay, so”, and “Well” are accepted, along with “shown” and curly apostrophes. Regression tests replay the reported sequence: “Alright can you tell me what's happening on monitor 1?” → monitor 1; “Tell me what's happening on this screen?” → the display containing Alice; “Can you tell me what's shown on my other screen?” → the remaining display relative to the last captured monitor. Without a previous capture, “other” is relative to Alice's display. With one screen it returns the connected count; with three or more it asks for a monitor number rather than choosing arbitrarily. Screen access is not denied merely because a sentence missed the capture parser.

Automatic-capture routing now recognizes direct requests such as “Look at monitor 2”, “Check my first monitor”, “Take a screenshot of monitor one”, and “Can you tell me what is happening on my second monitor?” as well as the original screen phrases. Matching is deterministic and limited to explicit observation requests; it does not depend on an LLM tool decision. Typed input and STT transcripts use the same parser. These requests take fresh screenshots without manually sharing an attachment.

With exactly one connected display, untargeted requests default to logical monitor 1 even if a previously selected monitor has disconnected. An explicit number outside 1 through the connected-display count does not capture: the validated count is passed through the normal conversation and speech completion path, producing an answer such as “I can't look at monitor 3 because this device only has 2 connected screens. Available monitors: 1 through 2.” Tests cover number words, ordinals, invalid numbers, single-monitor defaults, no vision call on failure, and spoken error delivery.

Restart the updated Windows backend and both Electron clients before testing.

1. Ask “How many monitors are connected to this device?” on each client. Confirm the answer follows the client, including dimensions and primary monitor.
2. Open **paperclip → Screen**. Verify numbered labels and the monitor containing Alice's window. Refresh after connecting/disconnecting a monitor.
3. Put a harmless large-text document on the selected monitor. Choose that monitor, ask Alice to read its heading, and confirm sharing. Expect a delay while local vision runs.
4. On the Mac, verify Alice describes the Mac's screen, even if the PC is showing different content.
5. Confirm an OS-denied capture fails clearly and a disconnected selected monitor does not silently fall back.
6. Say “Can you tell me what's going on in my screen?” and verify capture occurs without an ATLAS dialog. Test “Describe my screen on monitor 2” to select another display explicitly.
7. Ask about screen contents without sharing a new screenshot; Alice should distinguish historical descriptions from current visibility.

The user has verified basic live screenshot analysis; the revised paperclip flow, direct natural-language requests, and application-level monitor switching need retesting. Mac permission behavior remains environment-dependent. Phase 3 has not begun.

API references: [Electron desktopCapturer and macOS consent](https://www.electronjs.org/docs/latest/api/desktop-capturer/), [Electron display source IDs](https://github.com/electron/electron/blob/main/docs/api/structures/desktop-capturer-source.md), [Ollama vision image payloads](https://docs.ollama.com/capabilities/vision).


### Vision grounding follow-up

The configured visual interpreter remains local `qwen3.5:4b`; no separate OCR model or image parser was added. Generic screen requests have their monitor target resolved deterministically before inference. Qwen receives the fresh pixels and a visible-content task, rather than being asked to infer monitor identity from labels inside the image. Custom questions supplied through the Screen menu retain their question text. Monitor numbers are derived from validated inventory positions, not long OS IDs or labels inside screenshots. Client/server logs include matching image-hash prefixes without image content.

A live synthetic test reproduced the reported failure: an ATLAS-like image containing old replies claiming Display 2 caused Qwen to adopt that claim despite capture-source Monitor 1. After normalizing the generic observation task and removing competing inventory context, the same fixture was correctly described as an ATLAS conversation with those statements visible inside it (about 6.5 seconds). This is a model-grounding improvement, not a guarantee against all vision mistakes. Screen, launch, and transport tests passed. “Well then ... then” is now accepted by the request parser. Both backend and Electron need restarting for these changes.
