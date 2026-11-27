# Thanksgiving sprint: client device awareness

## Roadmap

1. Client device awareness (current phase).
2. Screen and monitor awareness.
3. Open-source Wordle solver evaluation and upgrade.
4. Visual Wordle interaction.
5. ESPN fantasy basketball expansion.
6. Model-based response builder: let Alice compose characterized responses from checked results instead of repeating deterministic templates. Preserve deterministic facts, execution outcomes, and permission enforcement outside the model.
7. Speaker recognition and voice profiles.
8. Owner-only voice activation and deterministic permission enforcement. Voice recognition alone does not authenticate sensitive or destructive actions.
9. Physical environmental awareness through MacBook/iPhone cameras, time permitting.

Only Phase 1 is implemented by this change. Finish its real-device acceptance check before proceeding.

## Phase 1 design and changed files

- `electron/clientIdentity.js`: saves a UUID, display name and device kind in `atlas-client-device.json` under Electron's per-user `userData` directory. OS is observed on the client at launch. Identity belongs to the installation/profile, not physical hardware; copying its data copies the ID. Corrupt storage fails visibly instead of silently rotating identity.
- `electron/main.js`: registers on every WebSocket connection before normal RPC calls proceed; rejects outstanding calls on disconnect; exposes registration status to the renderer. Uses the existing `ATLAS_WS_URL` connection, including Tailscale deployments.
- `electron/preload.js`, `renderer/lib/atlas-events.ts`: expose `getClientDevice` and optional voice transcription receipts on `sendMessage`.
- `backend/src/devices/clientRegistry.js`: validates a versioned registration, stores live connections, creates immutable interaction snapshots, and resolves an exact origin connection for future client operations.
- `backend/src/devices/clientSession.js`: connection-local registration/message/STT protocol. Client-supplied message options cannot replace the registered device. Short-lived, single-use transcript receipts bind submitted voice text to its capture/transcription origin. Receipts expire after two minutes; reconnecting requires recording again.
- `backend/src/devices/interactionContext.js`: request-local asynchronous context for future tools and a concise context section separating backend OS from the client. Missing registration stays unknown.
- `backend/src/server.js`: integrates the protocol, removes disconnected clients, and catches malformed RPC JSON without crashing the process.
- `backend/src/interface/atlasInterface.js`, `backend/src/core/conversationEngine.js`, `backend/src/core/contextBuilder.js`: preserve device context through asynchronous foreground work and context assembly. Request-start events retain origin metadata.
- `renderer/components/atlas-app.tsx`: shows the registered name in the desktop header, retains voice receipts, and displays RPC errors without leaving the chat stuck in thinking state.

Live connections are in memory. The backend now remembers device identities, capabilities, last-seen timestamps, and last reported monitors in `backend/.local/devices.json` (override with `ATLAS_DEVICE_STORE_FILE`). Writes replace the file atomically; online status is never persisted. After a backend restart, remembered devices start offline and become online when their clients reconnect. Refresh updates status and metadata without removing offline entries. Devices forgotten by an older backend need to connect once to enter this durable list. This is device inventory, not personal memory or a conversation-history store.

Device questions use the input interpreter's `devices/read` domain and the shared response builder. At execution time the backend supplies the same inventory used by the Devices page. Answers distinguish online status, reported capabilities, and OS permissions; reading inventory never captures a screen or authorizes remote control. The current-client identity response remains available separately.

## Registration and routing contract

The existing RPC envelope is `{ id, method, args }`. New clients call `registerClient` with one object:

```json
{
  "schemaVersion": 1,
  "deviceId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "displayName": "MacBook",
  "os": "macos",
  "deviceKind": "laptop",
  "clientType": "electron",
  "capabilities": {
    "textInput": { "supported": true, "permission": "not-required" },
    "audioPlayback": { "supported": true, "permission": "not-required" },
    "microphone": { "supported": true, "permission": "unknown" },
    "screenshot": { "supported": false, "permission": "unknown" },
    "camera": { "supported": false, "permission": "unknown" }
  }
}
```

The response and `getClientDevice` return `{ connectionId, inputSource, client }`. `client` is null for legacy connections. Each connection registers once; restart/reconnect to change registration. Unknown capabilities are omitted and absent supported flags default to false. OS enums include iOS/watchOS and device kinds include phone/watch/tablet; these are extension points, not working mobile clients.

`resolveTarget(interaction, capability)` only selects the original live connection. It returns `disconnected`, `unknown-client`, `unsupported`, or `permission-unavailable` instead of substituting the host or another connection. Success means routing eligibility only: a future tool must separately check authorization, implemented handlers, current availability, and OS consent. Phase 1 sends no capture commands.

All registration is self-reported. IDs, device names, capability flags, and Tailscale connectivity are not owner authentication and cannot bypass the existing permission system. Capability permission is not probed at launch, so microphone permission remains unknown in registration even though the existing recording flow can request it.

## Setup and demonstration

Update both Electron clients and the Windows backend. On the MacBook, launch the existing Electron client with these environment variables in its shell:

```sh
export ATLAS_DEVICE_NAME="MacBook"
export ATLAS_DEVICE_KIND="laptop"
export ATLAS_WS_URL="ws://<existing-windows-tailscale-address>:7341"
```

Then use the existing frontend/Electron launch procedure. `ATLAS_DEVICE_NAME` and `ATLAS_DEVICE_KIND` are Electron process variables, not backend `.env` settings. They are saved locally; subsequent launches retain the name/kind. Without overrides, macOS uses the honest default `Mac` rather than guessing MacBook hardware. Windows defaults to `Windows PC`; a Windows laptop can also use `ATLAS_DEVICE_KIND=laptop`.

1. Confirm the header shows Windows PC on the PC and MacBook on the Mac.
2. Ask on each client, “Which device am I using, and where is your backend running?” Verify Alice distinguishes the client from the Windows host.
3. Alternate between clients in one conversation; the current interaction must determine the answer.
4. Check `await window.atlasBridge.getClientDevice()` in Electron DevTools when inspecting IDs. Each installation should differ. Restart/reconnect: `deviceId` remains the same, `connectionId` changes.
5. Ask the same question through microphone input. Confirm existing playback and transcription still work.
6. Ask whether Alice can see the screen or camera. She should say capture is not implemented, not claim a view of the environment.

No browser-only transport exists in this checkout: the renderer uses Electron's preload bridge. If the deployed Mac frontend is a browser-only/custom variant, its transport must implement this registration contract before it can identify itself. No iPhone/Watch client was added.

## Validation and remaining limits

Passed automated checks:

- `clientDevices.test.js`: persistence, OS separation, invalid registration, immutable snapshots, overlapping async requests, voice origin/expiry/replay protection, reconnect identity, unknown clients, and target resolution without fallback.
- `clientDeviceContext.test.js`: actual context-builder output retains personality and separates client/host, with no previous-client leakage.
- `clientDeviceTransport.test.js`: actual WebSocket server with two clients, reconnect, malformed JSON recovery, and voice receipts; database/model/audio services are replaced with fixtures.
- Existing conversation transition/resume/context retrieval/action-scope tests, Wordle conversation/dialogue tests, ESPN conversation/intent tests, and Kokoro lifecycle tests.
- Renderer TypeScript checking, JavaScript syntax checks, and `git diff --check`.

The real PC/MacBook demonstration and live model/audio checks remain pending. Automated tests do not prove the installed model will always describe its context correctly.

The existing shared active conversation, broadcast response/audio events, and global interrupt behavior remain unchanged. This is per-interaction identity, not independent concurrent user sessions or output isolation. Device context is not written into historical conversation rows. Screenshot/camera availability is not actively probed; those clients and handlers belong to later phases.

## Follow-up: one-branch host/client launch

`npm run dev` now detects the configured Windows host `DESKTOP-ALHAOC4`; other machines run only the local frontend and Electron and connect to `ws://100.120.153.51:7341`. The supplied `100.71.243.117` entry identified the Mac and is not used as the backend destination. The Mac no longer needs a separate branch or a manually exported backend address for this setup.

Added `atlas.config.json`, `electron/launchConfig.js`, and `scripts/dev.js`, `scripts/startElectron.js`, `scripts/installDependencies.js`. Updated root npm scripts and Electron exit handling: only host mode sends the shutdown RPC. Local overrides live in ignored `atlas.local.json`; see the root README for precedence and commands. No backend credentials are copied to clients.

Validation: `tests/launchConfig.test.js` covers the designated PC, Mac/Linux/other Windows clients, process plans, invalid configuration and explicit overrides. `tests/electronClientLifecycle.test.js` exercises the real Electron main module against app/socket fixtures and verifies client registration, messaging and host-only shutdown. Host/client dry runs and device/transport/resume regressions passed. A live Mac launch is still pending. Packaged-app backend-service startup remains outside this source-launch change.
