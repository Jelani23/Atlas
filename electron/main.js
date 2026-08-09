// electron/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = process.env.ATLAS_RENDERER_URL || 'http://localhost:3000';
const BACKEND_WS_URL = process.env.ATLAS_WS_URL || 'ws://localhost:7341';
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
        sendStatusToRenderer('ready');
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

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
ipcMain.handle('atlas:sendMessage', async (_event, text) => callAtlas('sendMessage', [text]));
ipcMain.handle('atlas:getState', () => callAtlas('getState'));
ipcMain.handle('atlas:listModes', () => callAtlas('listModes'));
ipcMain.handle('atlas:setMode', (_event, mode) => callAtlas('setMode', [mode]));
ipcMain.handle('atlas:resetConversation', async () => callAtlas('resetConversation'));
ipcMain.handle('atlas:resolvePermission', (_event, id, decision) => callAtlas('resolvePermission', [id, decision]));
ipcMain.handle('atlas:listConversations', async () => callAtlas('listConversations'));
ipcMain.handle('atlas:getConversation', async (_event, sessionId) => callAtlas('getConversation', [sessionId]));
ipcMain.handle('atlas:newConversation', async () => callAtlas('newConversation'));

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
    createWindow();
    connectAtlas(); // Start WS client

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    isShuttingDown = true;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
});