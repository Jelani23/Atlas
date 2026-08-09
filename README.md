# Atlas — Electron Shell

This folder wires your existing Atlas engine (`backend/`, the `atlasUpdated` project) to
the v0-generated UI (`renderer/`) inside an Electron app.

```
atlas-electron/
  backend/     <- your Atlas engine, unchanged except for two additive things (see below)
  renderer/    <- the v0 Next.js UI, unchanged except for real backend wiring + one layout tweak
  electron/    <- main.js + preload.js, the only glue code
```

## How the pieces talk to each other

```
renderer (React)  --window.atlasBridge-->  preload.js  --IPC-->  main.js  --calls-->  AtlasInterface  --calls-->  conversationEngine
     ^                                                               |
     |______________________ atlas:event (standardized events) _____|
```

The UI never talks to `normalizer.js`, `planner.js`, `tools/registry.js`, or any other
backend file — it only knows about `backend/src/interface/atlasInterface.js`
(`AtlasInterface`), and only ever sees the 9 standardized event types. That's the
one integration point; if you rewrite the planner or swap tools around later, the UI
doesn't need to change at all.

### What actually changed in the backend

Two small, additive changes — nothing about how the planner/tools/normalizer work was touched:

1. **`backend/src/core/conversationEngine.js`** — `handleMessage` now accepts an optional
   `onEvent(type, payload)` callback (defaults to a no-op, so the existing CLI in
   `backend/src/index.js` behaves exactly as before). It's called at the natural
   checkpoints that already existed in the function (intent route, planner route, memory
   extraction, context build, LLM complete) to emit the standardized events below.
2. **`backend/src/interface/atlasInterface.js`** *(new file)* — an `EventEmitter` class
   that is the single supported entry point for any client. It wraps
   `conversationEngine`, session/memory bookkeeping, and mode switching, and re-emits
   everything as the standardized events. Electron's `main.js` is the only other file
   that imports it.

### The standardized event set

| Event | Payload | When |
|---|---|---|
| `user.message` | `{ text }` | Right after `sendMessage()` is called |
| `atlas.thinking` | `{ phase: 'intent' \| 'generating' }` | Intent routing starts / final LLM generation starts |
| `atlas.tool_started` | `{ phase: 'planning' }` | Planner is about to decide/act |
| `atlas.tool_progress` | `{ tool, note }` | Reserved for future granular in-tool progress |
| `atlas.tool_completed` | `{ tool, success }` | Planner finished (`tool` is `null` if no tool was needed) |
| `atlas.response` | `{ text }` | Final reply is ready |
| `atlas.error` | `{ message }` | Anything in the pipeline threw |
| `atlas.status` | `{ phase, ...extra }` | Bookkeeping: `ready`, `memory`, `context`, `mode_changed`, `conversation_reset`, `shutdown` |
| `atlas.model_changed` | `{ model, reason }` | Fires whenever the model swarm swaps models between turns |

`renderer/components/atlas-app.tsx` maps this stream to the cloud's visual state and the
"thought path" panel:

```
user sends message
   -> atlas.thinking (intent)      -> cloud: thinking, panel: "Understanding request…"
   -> atlas.tool_started            -> cloud: working,  panel: "Deciding on an approach…"
   -> atlas.tool_completed          -> panel: "Used <tool>" (or "No tool needed")
   -> atlas.model_changed (maybe)   -> panel: "Switched to <model>"
   -> atlas.thinking (generating)   -> cloud: thinking,  panel: "Composing a response…"
-> sendMessage() resolves with the reply
   -> cloud: speaking, response area shows the reply, settles back to idle
```

`atlas.status` and `atlas.tool_progress` are wired up too (see `describeEvent` in
`atlas-app.tsx`) — add more `case`s there any time you want a new phase to show up in the
panel, without touching the backend again.

## The UI tweak you asked for

The "thought path" panel now lives in its own row directly under the "Atlas" header,
left-aligned, with the same horizontal padding as the header (`px-6 md:px-10`) plus a bit
of top padding (`pt-2 md:pt-5`) so it has real breathing room from the ceiling and the
left wall, instead of being centered over the cloud.

## Setup

```bash
cd atlas
npm install            # installs electron/electron-builder + (via postinstall) backend & renderer deps
cp backend/.env.example backend/.env
# fill in backend/.env same as you already do for the CLI (Ollama/Supabase/etc.)
```

Make sure Ollama is running locally (same as when you run the CLI with `npm start` inside
`backend/`).

### Development

```bash
npm run dev
```

This starts the Next.js dev server on `http://localhost:3000` and launches Electron
pointed at it, with the Atlas backend running in Electron's main process.

### Production build

```bash
npm run build
```

This does a static export of the renderer (`renderer/out/`) and packages everything with
`electron-builder` into `dist/`.

## Notes / things left as-is on purpose

- The mic button still just toggles a `listening` visual state — no STT is wired up yet
  (that's on your roadmap; when you add it, have it call `atlasBridge.sendMessage` the
  same way typed messages do, and add a `listening: true/false` payload if you want the
  cloud to react to it distinctly).
- `backend/` keeps its own `package.json`/`node_modules` (same as today) — Electron's
  main process just `require()`s it directly, the same way `backend/src/index.js`
  already does for the CLI.
- Nothing about Supabase, the model swarm, memory, or the planner's tool logic was
  touched.
