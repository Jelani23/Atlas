// electron/main.js
const { app, BrowserWindow, ipcMain, screen, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { loadClientIdentity } = require('./clientIdentity');
const { readConfig, resolveLaunchConfig } = require('./launchConfig');
const launchConfig = resolveLaunchConfig({ config: readConfig(path.join(__dirname, '..')) });
let clientIdentity;
let registrationReady = null;
const { createScreenAwareness, isScreenRequest } = require('./screenAwareness');
const screenAwareness = createScreenAwareness({ screen, desktopCapturer, systemPreferences });

// Marker file that tells us whether Atlas has ever launched on this machine
// before. Lives in Electron's per-user data dir, so it survives app updates
// but not a full uninstall/reinstall — which is exactly the "first startup"
// behavior we want.
const FIRST_LAUNCH_FLAG = path.join(app.getPath('userData'), 'atlas-first-launch-complete');

function isFirstLaunch() {
    return !fs.existsSync(FIRST_LAUNCH_FLAG);
}

function markFirstLaunchComplete() {
    try {
        fs.writeFileSync(FIRST_LAUNCH_FLAG, String(Date.now()));
    } catch (err) {
        console.error('[Electron] Failed to write first-launch flag:', err);
    }
}

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = process.env.ATLAS_RENDERER_URL || 'http://localhost:3000';
const BACKEND_WS_URL = launchConfig.backendUrl;
// DevTools used to auto-open every single dev launch. That's a deliberate
// opt-in now — set ATLAS_DEVTOOLS=1 when you actually want it.
const OPEN_DEVTOOLS = process.env.ATLAS_DEVTOOLS === '1';

let mainWindow = null;
let ws = null;
let isShuttingDown = false;
let reconnectAttempts = 0;
let rpcId = 0;
const pendingRpcs = new Map();

function sendStatusToRenderer(status) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('atlas:status', status);
        mainWindow.webContents.send('atlas:event', { type: 'atlas.status', payload: { phase: 'client_connection', status } });
    }
}

function connectAtlas() {
    if (isShuttingDown) return;
    console.log(`[Electron] Connecting to Atlas backend at ${BACKEND_WS_URL}...`);
    sendStatusToRenderer('connecting');
    
    ws = new WebSocket(BACKEND_WS_URL);

    ws.on('open', () => {
        console.log('[Electron] Connected to Atlas backend.');
        reconnectAttempts = 0;
        registrationReady = callAtlas('registerClient', [clientIdentity]);
        registrationReady.then(device => {
            sendStatusToRenderer('ready');
            mainWindow?.webContents.send('atlas:event', { type: 'atlas.status', payload: { phase: 'client_registered', device } });
        }).catch(error => {
            console.error('[Electron] Client registration failed:', error.message);
            sendStatusToRenderer('offline');
        });
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        // Resolve RPC promises
        if (msg.id && pendingRpcs.has(msg.id)) {
            const { resolve, reject } = pendingRpcs.get(msg.id);
            pendingRpcs.delete(msg.id);
            if (msg.error) reject(new Error(msg.error));
            else resolve(msg.result);
        } 
        // Forward standardized events to renderer
        else if (msg.type) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atlas:event', { type: msg.type, payload: msg.payload });
            }
        }
    });

    ws.on('close', () => {
        registrationReady = null;
        for (const pending of pendingRpcs.values()) pending.reject(new Error('Backend disconnected'));
        pendingRpcs.clear();
        if (isShuttingDown) return;
        console.log('[Electron] Atlas backend disconnected. Reconnecting...');
        sendStatusToRenderer('offline');
        
        // Exponential backoff: 250ms -> 500ms -> 1s -> 2s -> 5s max
        const delay = Math.min(5000, 250 * Math.pow(2, reconnectAttempts));
        reconnectAttempts++;
        setTimeout(connectAtlas, delay);
    });

    ws.on('error', (err) => {
        // Errors are expected during restarts; 'close' will handle the reconnect
    });
}

function callAtlas(method, args = []) {
    if (method !== 'registerClient' && registrationReady) {
        return registrationReady.then(() => sendRpc(method, args));
    }
    return sendRpc(method, args);
}

function sendRpc(method, args) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return reject(new Error('Atlas backend is currently restarting or offline.'));
        }
        const id = ++rpcId;
        pendingRpcs.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, args }));
    });
}

function createWindow() {
    // First time Atlas has ever opened on this machine — launch full screen.
    // Every launch after that respects whatever size/position the OS
    // remembers (or our 1200x800 default) instead of forcing full screen.
    const firstLaunch = isFirstLaunch();

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 720,
        minHeight: 560,
        backgroundColor: '#bfe0fb',
        // The renderer draws its own title bar (title-bar-controls.tsx) —
        // this is what actually turns the OS one off. Without this, the
        // native title bar sits there on top and the custom one never shows.
        frame: false,
        fullscreen: firstLaunch,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    if (firstLaunch) markFirstLaunchComplete();

    if (isDev) {
        mainWindow.loadURL(RENDERER_DEV_URL);
        if (OPEN_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/out/index.html'));
    }

    mainWindow.on('maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximized-changed', true);
        }
    });

    mainWindow.on('unmaximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximized-changed', false);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC surface: renderer -> Electron -> Atlas Backend (via WS)
ipcMain.handle('atlas:listScreens', () => screenAwareness.inventory(mainWindow));
ipcMain.handle('atlas:sendMessage', async (_event, text, options = {}) => {
    const originSocket = ws;
    if (!originSocket || originSocket.readyState !== WebSocket.OPEN) throw new Error('Connect to the backend before sharing a screen or sending a message.');
    // Renderer cannot supply pixels or fabricated monitor metadata. Only this
    // explicit client-side request path can capture. OS permissions still apply.
    let capture = null, requestedMonitorUnavailable, requestedOtherMonitorIssue;
    let initialScreens = null;
    try { initialScreens = screenAwareness.inventory(mainWindow); } catch { /* Ordinary chat remains available. */ }
    const prepared = await callAtlas('prepareTask', [text, initialScreens]);
    if (ws !== originSocket) throw new Error('Connection changed while interpreting the request.');
    const wordleIntent = prepared.intent;
    const wordleCapture = Boolean(wordleIntent?.displayId);
    try {
        if (wordleCapture) {
            capture = await screenAwareness.capture(mainWindow, wordleIntent.displayId);
        } else if (options.screenDisplayId !== undefined || isScreenRequest(text)) {
            capture = await screenAwareness.capture(mainWindow, options.screenDisplayId, { requested: options.screenDisplayId === undefined && isScreenRequest(text), text });
        }
    } catch (error) {
        if (error.code === 'SCREEN_RANGE') requestedMonitorUnavailable = error.requestedMonitor;
        else if (error.code === 'SCREEN_OTHER') requestedOtherMonitorIssue = true;
        else throw error;
    }
    if (ws !== originSocket || originSocket.readyState !== WebSocket.OPEN) throw new Error('Connection changed while sharing; please try again.');
    if (capture) mainWindow?.webContents.send('atlas:event', { type: 'atlas.screen_captured', payload: {
        displayId: capture.displayId, displayLabel: capture.displayLabel, capturedAt: capture.capturedAt,
        imageHash: capture.imageHash, dataUrl: `data:image/jpeg;base64,${capture.data}`,
    } });
    let screens = null;
    try { screens = screenAwareness.inventory(mainWindow); }
    catch (error) {
        if (capture) throw error;
        console.warn('[Electron] Monitor inventory unavailable:', error.message);
    }
    const result = await callAtlas('sendMessage', [text, {
        transcriptionId: options.transcriptionId,
        taskReceipt: prepared.taskReceipt,
        screens,
        requestedMonitorUnavailable,
        requestedOtherMonitorIssue,
        ...(capture ? { screenCapture: { ...capture, observationOnly: isScreenRequest(text) } } : {}),
    }]);
    return result;
});
ipcMain.handle('atlas:getClientDevice', () => callAtlas('getClientDevice'));
ipcMain.handle('atlas:getState', () => callAtlas('getState'));
ipcMain.handle('atlas:listModes', () => callAtlas('listModes'));
ipcMain.handle('atlas:setMode', (_event, mode) => callAtlas('setMode', [mode]));
ipcMain.handle('atlas:resetConversation', async () => { return callAtlas('resetConversation'); });
ipcMain.handle('atlas:resolvePermission', (_event, id, decision) => callAtlas('resolvePermission', [id, decision]));
ipcMain.handle('atlas:listConversations', async () => callAtlas('listConversations'));
ipcMain.handle('atlas:getConversation', async (_event, sessionId) => callAtlas('getConversation', [sessionId]));
ipcMain.handle('atlas:resumeConversation', async (_event, sessionId) => { return callAtlas('resumeConversation', [sessionId]); });
ipcMain.handle('atlas:newConversation', async () => {
    console.log('[Electron] New conversation requested by renderer.');
    try {
        const result = await callAtlas('newConversation');
        console.log(`[Electron] New conversation ready | session=${result?.sessionId || 'unknown'}`);
        return result;
    } catch (error) {
        console.error('[Electron] New conversation failed:', error.message);
        throw error;
    }
});
ipcMain.handle('atlas:deleteConversation', async (_event, sessionId) => callAtlas('deleteConversation', [sessionId]));
ipcMain.handle('atlas:renameConversation', async (_event, sessionId, title) => callAtlas('renameConversation', [sessionId, title]));
ipcMain.handle('atlas:transcribeAudio', async (_event, base64Audio) => callAtlas('transcribeAudio', [base64Audio]));
ipcMain.handle('atlas:interrupt', async () => callAtlas('interrupt', []));

// IPC surface: renderer's custom title bar -> the actual BrowserWindow chrome
ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});
ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.handle('window:close', () => {
    mainWindow?.close();
});
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

app.whenReady().then(() => {
    clientIdentity = loadClientIdentity(app.getPath('userData'));
    createWindow();
    connectAtlas(); // Start WS client

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// before-quit needs to be async (so the reflection write in atlas.shutdown()
// has time to land in Supabase before the process dies), but Electron's
// 'before-quit' handler itself can't be awaited — so we preventDefault() the
// first time through, do the async RPC, then call app.quit() again.
// shutdownComplete guards that second pass from looping back into this same
// async block.
let shutdownComplete = false;

app.on('before-quit', (event) => {
    if (shutdownComplete) return;

    event.preventDefault();
    isShuttingDown = true;

    (async () => {
        try {
            if (launchConfig.shutdownBackendOnExit && ws && ws.readyState === WebSocket.OPEN) {
                // The shutdown RPC durably closes the current session and
                // marks its reflection pending. It should be fast; retain a
                // timeout so an unreachable or wedged backend cannot block
                // quitting forever.
                await Promise.race([
                    callAtlas('shutdown'),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('shutdown RPC timed out')), 8000)
                    ),
                ]);
            }
        } catch (err) {
            // Backend already gone, unreachable, etc. — nothing to do, just
            // proceed with quitting rather than hang the app on exit.
            console.error('[Electron] Backend shutdown RPC failed:', err);
        } finally {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
            shutdownComplete = true;
            app.quit();
        }
    })();
});
