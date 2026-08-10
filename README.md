# Atlas

Atlas is a personal AI assistant system — a local-first, model-agnostic
companion in the vein of Jarvis/Friday (MCU) or Raphael (*That Time I Got
Reincarnated as a Slime*), built to run entirely on consumer hardware
rather than a hosted API.

It ships as a desktop app: an Electron shell wrapping a Next.js/React/
Tailwind UI (a "cloud" presence visualization plus a chat interface) on
top of a Node.js backend that talks to local LLMs through Ollama.

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

```bash
npm install       # installs root, backend, and renderer deps
npm run dev       # runs renderer + backend + Electron together
```

`npm run build` produces a packaged Electron app via `electron-builder`.