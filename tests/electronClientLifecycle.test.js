const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const mainPath = require.resolve('../electron/main');
const actualConfig = require('../electron/launchConfig');
const shared = require('../atlas.config.json');

async function exercise(role) {
    const calls = [], ipc = new Map();
    let socket, quits = 0;
    const app = new EventEmitter();
    Object.assign(app, { isPackaged: false, getPath: () => '/fixture', whenReady: () => Promise.resolve(), quit: () => { quits++; } });
    class Window extends EventEmitter {
        constructor() { super(); this.webContents = { send() {}, openDevTools() {} }; }
        loadURL(url) { assert.equal(url, 'http://localhost:3000'); }
        isDestroyed() { return false; }
        static getAllWindows() { return []; }
    }
    class Socket extends EventEmitter {
        static OPEN = 1;
        constructor(url) { super(); socket = this; this.readyState = 1; assert.equal(url, role === 'host' ? 'ws://127.0.0.1:7341/' : 'ws://100.120.153.51:7341/'); queueMicrotask(() => this.emit('open')); }
        send(raw) {
            const message = JSON.parse(raw); calls.push(message);
            queueMicrotask(() => this.emit('message', JSON.stringify({ id: message.id, result: {} })));
        }
        close() { this.readyState = 3; this.emit('close'); }
    }
    const originalLoad = Module._load;
    const originalTimeout = global.setTimeout;
    // Existing graceful shutdown timeout must not keep this fixture process alive.
    global.setTimeout = (...args) => originalTimeout(...args).unref();
    Module._load = function(request, parent, ...args) {
        if (parent?.filename === mainPath) {
            if (request === 'electron') return { app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => ipc.set(name, fn) } };
            if (request === 'ws') return Socket;
            if (request === 'fs') return { existsSync: () => true };
            if (request === './clientIdentity') return { loadClientIdentity: () => ({ deviceId: 'local-device' }) };
            if (request === './launchConfig') return { readConfig: () => shared, resolveLaunchConfig: () => actualConfig.resolveLaunchConfig({ config: shared, env: { ATLAS_ROLE: role } }) };
        }
        return originalLoad.call(this, request, parent, ...args);
    };
    try {
        delete require.cache[mainPath];
        require(mainPath);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls[0].method, 'registerClient');
        assert.equal(calls[0].args[0].deviceId, 'local-device');
        await ipc.get('atlas:sendMessage')({}, 'hello');
        assert.equal(calls[1].method, 'sendMessage');
        app.emit('before-quit', { preventDefault() {} });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls.some(c => c.method === 'shutdown'), role === 'host', 'Only host shutdown may end the backend session');
        assert.equal(socket.readyState, 3);
        assert.equal(quits, 1);
    } finally { Module._load = originalLoad; global.setTimeout = originalTimeout; }
}
(async () => {
    await exercise('client');
    await exercise('host');
    console.log('electronClientLifecycle.test.js: local registration, messaging and host-only shutdown passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
