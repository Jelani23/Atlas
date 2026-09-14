# Atlas Mac / iOS PWA setup

This branch lets the existing `renderer` run in two environments without maintaining two UIs:

- **Windows desktop:** Electron keeps using `window.atlasBridge` from `electron/preload.js`.
- **Mac / iPhone / iPad:** the PWA installs a WebSocket-backed `window.atlasBridge` that speaks the same Atlas RPC/event protocol.

The UI remains usable when the host PC is unavailable. Backend-dependent features reconnect automatically when Atlas comes back online.

## Connection states

The PWA displays four remote states:

1. **Connecting to Atlas…** — looking for the host PC.
2. **Atlas is waking up…** — WebSocket is reachable, but `getState().ready` is still false.
3. **Atlas connected** — backend is ready.
4. **Atlas is currently not active.** — PC/backend cannot currently be reached. The UI stays available for layout/tab work.

The PWA retries automatically, when the device returns online, and when Safari/PWA returns to the foreground. There is also a manual Retry button.

## Current host

The default remote host is:

```text
desktop-alhaoc4.tail3338a8.ts.net
```

Atlas already exposes its HTTP/WebSocket server on port `7341` by default (`ATLAS_PORT` can override it).

## One-time Windows/Tailscale setup

An installed PWA is served over HTTPS. Browsers will block an insecure `ws://` connection from an HTTPS page, so expose the existing local Atlas server through **Tailscale Serve**. Do not use Tailscale Funnel; Atlas should remain private to the tailnet.

With Atlas running on the Windows PC, open PowerShell and run:

```powershell
tailscale serve --bg localhost:7341
```

Then inspect the result:

```powershell
tailscale serve status
```

Tailscale should report an HTTPS URL based on the PC's tailnet hostname, normally:

```text
https://desktop-alhaoc4.tail3338a8.ts.net
```

The browser bridge automatically converts that to `wss://desktop-alhaoc4.tail3338a8.ts.net/` for Atlas events/RPC.

If Tailscale asks you to enable HTTPS certificates for the tailnet, follow the one-time authorization flow it opens.

To remove the Serve configuration later:

```powershell
tailscale serve reset
```

## Running the UI while developing

From the Atlas repo:

```powershell
npm install
npm run dev:renderer
```

Open the renderer from another tailnet device only if that development server is itself reachable from the device. For normal PWA use, deploy the static `renderer/out` build to an HTTPS host so the UI remains available even when the Atlas PC is asleep.

Build the static renderer with:

```powershell
npm run build:renderer
```

The existing Next config already exports a static site into `renderer/out`.

## Installing on iPhone/iPad

1. Open the deployed Atlas UI in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch Atlas from the new home-screen icon.
5. Make sure Tailscale is connected on the iPhone/iPad before expecting Alice to connect to the Windows backend.

The service worker caches the UI shell so the PWA can reopen for visual/layout work even when Atlas itself is offline.

## Installing on Mac

Open the deployed HTTPS site in Safari and use Safari's web-app installation option, or use a Chromium browser's Install App action. Keep Tailscale connected when live Atlas features are needed.

## Changing the remote Atlas address

The PWA connection card has a settings button. The remote URL can be changed there and is stored only in that browser/device's local storage.

For an installed HTTPS PWA, enter an HTTPS endpoint such as:

```text
https://desktop-alhaoc4.tail3338a8.ts.net
```

For local HTTP-only development, a direct address such as the following also works:

```text
http://desktop-alhaoc4.tail3338a8.ts.net:7341
```

The direct HTTP form is for development only; it cannot be used from an HTTPS PWA because browsers block mixed-content WebSockets.

## Architecture notes

`renderer/lib/web-atlas-bridge.ts` deliberately mirrors the Electron preload bridge. Components should continue talking to `window.atlasBridge` rather than importing backend implementation files. This keeps the renderer platform-neutral and avoids separate Mac/iOS vs Windows feature implementations.

The service worker does **not** cache live Atlas backend data or WebSocket traffic. It only caches same-origin UI assets.
