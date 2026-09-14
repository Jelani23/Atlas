# Atlas Mac / iOS PWA setup

This branch keeps one shared renderer while separating **persistent Atlas data** from the **Windows-hosted AI runtime**.

- **Windows desktop:** Electron keeps using `window.atlasBridge` from `electron/preload.js` for Alice/Atlas execution.
- **Mac / iPhone / iPad:** the PWA uses a WebSocket-backed `window.atlasBridge` for Alice/Atlas execution.
- **All clients:** a browser-safe Supabase client can read persistent conversations, projects, tasks, project memory, knowledge metadata, and device state without requiring the Windows host to be running.

In other words, **Alice can be offline while the Atlas UI remains useful.**

## Two independent connections

The UI now distinguishes two services:

### Atlas cloud

Supabase stores durable shared state. When cloud access is unlocked, clients can read data directly even if the host PC is asleep.

The cloud card reports states such as:

- **Atlas cloud connected** — shared data is available.
- **Unlock Atlas** — enter the single-owner Atlas password on this device.
- **Atlas cloud unavailable** — network/cloud is unavailable; cached last-known data may still be shown where available.

### Alice / Atlas host

The Windows PC still provides compute and agent execution:

1. **Connecting to Atlas…** — looking for the host PC.
2. **Atlas is waking up…** — WebSocket is reachable, but Atlas is still initializing.
3. **Atlas connected** — Alice and local tools are available.
4. **Atlas is currently not active.** — the host is unavailable, but cloud-backed UI pages remain usable.

## One-time Supabase setup

### 1. Apply migration 013

Open Supabase **SQL Editor**, paste the contents of:

```text
backend/src/database/migrations/013_cross_device_workspace.sql
```

and run it once.

The migration:

- enables owner-only RLS reads for existing `sessions`, `conversations`, `project_memory`, and `knowledge_library` tables;
- creates persistent project, task, project-history, project-file, project-context, and device tables;
- seeds the current Projects prototype into durable state;
- restricts browser access to the single configured Atlas owner identity.

The trusted backend continues using its privileged Supabase key and therefore remains able to update these tables independently of browser RLS.

### 2. Create the one Atlas owner user

In Supabase **Authentication > Users**, create one email/password user with the owner email configured by Atlas. Choose the password yourself; do not put it in the repository.

The Atlas UI intentionally hides the account model. On a new device it simply shows **Unlock Atlas** and asks for the password. The email identity is fixed internally and is not part of the normal UI.

Supabase persists the authenticated session on that device, so normally this is a one-time unlock unless you explicitly choose **Lock** or clear browser data.

## Installing dependencies after pulling this branch

The renderer now uses the browser-safe Supabase JavaScript client. After pulling the branch, run:

```bash
npm --prefix renderer install
```

Then normal Mac UI development remains:

```bash
npm run dev:renderer
```

## Current host

The default remote host is:

```text
desktop-alhaoc4.tail3338a8.ts.net
```

Atlas exposes its HTTP/WebSocket server on port `7341` by default (`ATLAS_PORT` can override it).

## One-time Windows/Tailscale setup

An installed PWA is served over HTTPS. Browsers block an insecure `ws://` connection from an HTTPS page, so expose the existing local Atlas server through **Tailscale Serve**. Do not use Tailscale Funnel; Atlas should remain private to the tailnet.

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

```bash
npm run dev:renderer
```

For normal PWA use, deploy the static `renderer/out` build to an HTTPS host so the UI remains available even when the Atlas PC is asleep.

Build the static renderer with:

```bash
npm run build:renderer
```

The existing Next config exports a static site into `renderer/out`.

## What remains available when the host is off

After Atlas cloud is unlocked, the intended split is:

**Still available:**
- conversation history and transcripts;
- Projects and project context/history/files;
- persistent Tasks state and last-known progress;
- Devices and last-seen presence;
- cloud-backed knowledge/project metadata;
- local cached copies of data previously read on that device.

**Requires the Windows Atlas host:**
- talking to Alice / running LLM inference;
- local tools and PC automation;
- local TTS/STT services;
- starting or continuing agent work that executes on the host.

## Device presence

Browser/PWA clients heartbeat into `atlas_devices` while Atlas cloud is unlocked. The Windows backend also heartbeats as `atlas-host-pc` while it is running. The Devices UI considers a device online only while its heartbeat is fresh; otherwise it preserves the row and displays the last-known state as offline.

## Tasks

`atlas_tasks` is now the durable source for global and project task state. The renderer reads it directly from Supabase. `backend/src/state/workspaceState.js` provides trusted backend methods for updating tasks/projects/history. The future background-agent runtime should write its real progress/checkpoints through that repository rather than keeping task state only in memory.

## Installing on iPhone/iPad

1. Open the deployed Atlas UI in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch Atlas from the home-screen icon.
5. Unlock Atlas cloud once with your Atlas password.
6. Keep Tailscale connected only when you need Alice/the Windows-hosted runtime.

## Installing on Mac

Open the deployed HTTPS site in Safari and use Safari's web-app installation option, or use a Chromium browser's Install App action. Unlock Atlas cloud once on the Mac. Tailscale is only required for live Alice/host features.

## Changing the remote Atlas address

The PWA connection card has a settings button. The remote URL is stored only in that browser/device's local storage.

For an installed HTTPS PWA, use an HTTPS endpoint such as:

```text
https://desktop-alhaoc4.tail3338a8.ts.net
```

For local HTTP development, this form also works:

```text
http://desktop-alhaoc4.tail3338a8.ts.net:7341
```

## Architecture notes

`renderer/lib/web-atlas-bridge.ts` mirrors the Electron preload bridge for **execution**, while `renderer/lib/atlas-cloud.ts` handles durable **shared state**. Components should not receive privileged backend credentials.

The Supabase publishable key is intentionally browser-safe; data access is enforced by Supabase Auth + RLS. The backend's privileged key remains backend-only.

The service worker does not cache live WebSocket traffic. Cloud data uses its own small last-known local cache for read resilience.
