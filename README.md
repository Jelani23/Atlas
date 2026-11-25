# Atlas

Atlas is a personal AI assistant system — a local-first, model-agnostic
companion in the vein of Jarvis/Friday (MCU) or Raphael (*That Time I Got
Reincarnated as a Slime*), built to run entirely on consumer hardware
rather than a hosted API.

It ships as a desktop app: an Electron shell wrapping a Next.js/React/
Tailwind UI (a "cloud" presence visualization plus a chat interface) on
top of a Node.js backend that talks to local LLMs through Ollama.

## Cost requirement

Atlas/Alice development and operation must use free software and the existing
hardware. Do not add paid APIs, subscriptions, paid hosting, or required purchases.
Use installed local models for the current semantic evaluation work. The earlier
paid model comparison proposal was declined and is withdrawn. Retained remote
provider adapters are optional legacy integrations, not a requirement or an
automatic fallback for local model failures.

## Why

Most AI assistants are either a chat window bolted onto a hosted model, or
a cloud service you don't control. Atlas is the opposite bet: privacy-
focused, local-first, and hardware-constrained by design (developed
against an RTX 3060 Ti) — small specialized models doing real work instead
of one large model doing everything, so it stays usable without ongoing
token costs.

## Architecture

```
electron/     Desktop shell — main process, preload bridge to the renderer
renderer/     Next.js/React/Tailwind UI (the "cloud" + chat interface)
backend/      Node.js backend — conversation engine, memory, tools, models
```

**Backend (`backend/src`)**

- `server.js` — WebSocket server the Electron shell connects to. Forwards
  every backend event (`atlas.thinking`, `atlas.streaming`,
  `atlas.tool_started`, `atlas.response`, `atlas.error`, `atlas.status`,
  `atlas.model_changed`, …) straight through to the UI over one
  standardized event set, so the frontend never talks to backend
  internals directly.
- `interface/atlasInterface.js` — the backend's single entry point.
  Session lifecycle (start/switch/delete/rename conversations), message
  handling, mode switching, and post-session reflection all go through
  here.
- `core/conversationEngine.js` — orchestrates a single message: builds
  context, resolves intent, calls the model (streaming tokens back live
  when the provider supports it), and hands off to the planner/tool layer
  when a request needs more than a reply.
- `planner/` — multi-step planning and intent normalization for requests
  that need more than a single model call (routing, search pipeline,
  step-by-step task breakdown).
- `models/` — provider-agnostic model layer (`modelAdapter.js`,
  `modelRouter.js`) over pluggable providers (`providers/ollama.js`,
  `openai.js`, `deepseek.js`, `qwen.js`), so the model backing any given
  task can be swapped without touching the rest of the system.
- `memory/` — Supabase (Postgres)-backed memory system: working memory
  (per-session conversation log), procedural memory (learned
  trigger → action rules), project memory, world model, long-term
  profile, knowledge library, dev state, and a reflection journal that
  summarizes each session and extracts any lasting "learnings" once it
  ends.
- `tools/` — the tool surface the model can call, organized by category:
  `web` (search, time), `files` (read/search/inspect the codebase),
  `development` (syntax/JSON checks, running tests), `memory` (knowledge
  search, dev-state updates), `notes` (a small notes CRUD), `tasks`
  (background task status), `utilities` (calculator, unit/currency
  conversion, text stats), and `writing` (formatting, keyword
  extraction). Tools are auto-discovered by `toolRegistry.js` and gated
  by `permissions/permissionPolicy.js`, which assigns each one a risk
  tier (LOW/MEDIUM/…) and an allow/prompt default.
- `tasks/taskManager.js` — background/async task execution for anything
  that shouldn't block the main conversation turn.
- `events/` — a shared event bus (`eventBus.js`, `eventTypes.js`) that
  everything above publishes to; `atlasInterface.js` is the only thing
  that subscribes to it and re-emits a stable, UI-facing event set.

**Renderer (`renderer/`)**

Next.js app with a Home view (the cloud visualization, quick input, and a
truncated live response with a link to the full thread) and a
Conversations view (full scrolling history, session list, rename/delete).
The cloud's visual state (idle / thinking / speaking / error) is driven
entirely by the standardized backend event set above.

**Electron (`electron/`)**

`main.js` owns the app window and proxies the renderer's IPC calls to the
backend's WebSocket server; `preload.js` exposes a small, generic bridge
(`window.atlas`) rather than hand-wiring every individual event type.

## Status

Actively in development. Current focus is a "Multi-Model Swarm" — routing
different task types (general conversation, coding, reasoning, etc.) to
different small local models instead of one general-purpose model doing
everything — plus TTS/STT for voice interaction down the line.

## Requirements

- Node.js
- [Ollama](https://ollama.com) running locally
- A Supabase project (Postgres) for memory storage — see
  `SUPABASE_MIGRATION.md`

## Development

### Puzzle helper

Tell Alice “Let's play Wordle.” She suggests a guess; describe its colors or
paste the squares, and she checks the clues before suggesting the next one.
Partial or ambiguous feedback prompts a clarification. She remembers the board
in a local per-conversation JSON save. The local model interprets natural turns;
a bundled vocabulary and clue checks validate guesses. Explicit Wordle commands remain available; Connections
currently uses `Connections: new` plus a comma-separated board and `Connections: suggest`.
See the [commands and limitations](docs/puzzle-helper.md).

### Experimental checked code analysis

Use `Checked analyze src/<file>.js function <name> with <parameter> set to <value>` for the explicit checked-analysis pilot. Supply every function parameter; join additional assignments with `and`. It reads source without executing it. If any requested outcome lacks a bounded static check, it skips the model and reports the limitation, preserving any supported results. When all outcomes have checks, it can request a separately labeled, unverified model explanation. This deliberately narrow mode does not make model explanations reliable.

The normal chat and analysis modes keep their existing behavior. See the [live test checklist](docs/checked-analysis-live-check-2026-10-08.md) for examples, limitations and offline results.

```bash
npm install       # installs dependencies for this machine's role
npm run dev       # automatically selects host or client mode
```

`npm run build` produces a packaged Electron app via `electron-builder`.

### One branch, host and client launches

Source launches use `atlas.config.json` to recognize `DESKTOP-ALHAOC4` on Windows as the host. On that machine, `npm run dev` starts the backend, local renderer, and Electron. On the Mac (and other machines), the same command starts only a local renderer and Electron, connecting to `ws://100.120.153.51:7341` over Tailscale. Client dependency installation skips the backend; the Mac does not need backend credentials, Ollama, or Python voice services.

Run the updated checkout locally on each device. The Mac's Electron process owns its persistent device ID and microphone input. Opening or remotely controlling the PC's app does not create a Mac client. Closing a client disconnects it without sending the host a shutdown request.

```sh
npm run dev -- --dry-run  # inspect detected role and processes without launching
npm run dev:host          # explicit override
npm run dev:client        # explicit override
npm run test:launch       # offline role and Electron lifecycle tests
```

Environment overrides are `ATLAS_ROLE=auto|host|client`, `ATLAS_WS_URL`, and `ATLAS_PORT`. For persistent machine-specific overrides, create an ignored `atlas.local.json`, for example:

```json
{
  "role": "client",
  "backendUrl": "ws://100.120.153.51:7341"
}
```

Configuration precedence is environment, local file, shared file. Host mode connects only to its local backend port; use client mode for a remote destination. If explicitly converting a client installation to a host, run `npm --prefix backend install` and configure its backend services first. Tailscale and the host backend must be running for client communication; an offline host does not cause clients to start a replacement backend.

This launcher change covers source/development startup (`npm run dev`). Packaged Electron retains its existing external-backend requirement; it now selects the correct connection and shutdown behavior, but does not bundle a new backend-service supervisor. Live Mac startup and voice checks remain part of the device-awareness acceptance test.
