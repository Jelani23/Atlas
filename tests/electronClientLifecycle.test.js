const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const mainPath = require.resolve('../electron/main');
const actualConfig = require('../electron/launchConfig');
const shared = require('../atlas.config.json');

async function exercise(role) {
    const calls = [], ipc = new Map();
    let socket, quits = 0, inventoryFails = false, visualActive;
    const captures = [];
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
            let result = { visualWordleActive: visualActive };
            if (message.method === 'prepareTask') {
                const intent = require('../shared/visualWordleIntent').parseVisualWordle(message.args[0]);
                result = { taskReceipt: 'test-receipt', intent: intent && (intent.action === 'start' || visualActive)
                    ? { task: 'wordle', action: intent.action, ...(intent.action === 'stop' ? {} : { displayId: 'monitor-two' }) } : null };
            }
            queueMicrotask(() => this.emit('message', JSON.stringify({ id: message.id, result })));
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
            if (request === './screenAwareness') return { isScreenRequest: () => false, createScreenAwareness: () => ({
                capture: async (_window, id, options) => { captures.push({ id, options }); return { displayId: id || 'monitor-two', data: 'fixture' }; },
                inventory: () => { if (inventoryFails) throw new Error('Fixture inventory unavailable'); return { displays: [{ id: 'monitor-one', current: true, primary: true }, { id: 'monitor-two' }] }; }
            }) };
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
        assert.equal(calls[1].method, 'prepareTask');
        assert.equal(calls[2].method, 'sendMessage');
        assert.equal(calls[2].args[1].taskReceipt, 'test-receipt');
        await ipc.get('atlas:listDevices')();
        assert.equal(calls.at(-1).method, 'listDevices');
        assert.equal(calls.at(-1).args[0].displays.length, 2);
        inventoryFails = true;
        await ipc.get('atlas:listDevices')();
        assert.equal(calls.at(-1).method, 'listDevices');
        assert.equal(calls.at(-1).args[0], null, 'Monitor failure must not prevent listing computers');
        await ipc.get('atlas:sendMessage')({}, 'chat still works');
        assert.equal(calls.at(-1).method, 'sendMessage');
        assert.equal(calls.at(-1).args[1].screens, null, 'Monitor enumeration failure must not block chat');
        inventoryFails = false;
        await ipc.get('atlas:sendMessage')({}, 'done');
        assert.equal(captures.length, 0);
        visualActive = true;
        await ipc.get('atlas:sendMessage')({}, 'start Wordle on monitor 2');
        assert.equal(captures[0].id, 'monitor-two');
        await ipc.get('atlas:sendMessage')({}, 'done');
        assert.equal(captures[1].id, 'monitor-two', 'Follow-up stays on the game monitor');
        visualActive = false;
        await ipc.get('atlas:sendMessage')({}, 'done');
        const captureCount = captures.length;
        await ipc.get('atlas:sendMessage')({}, 'done');
        assert.equal(captures.length, captureCount, 'Finished games stop capture triggers');
        visualActive = true;
        await ipc.get('atlas:sendMessage')({}, 'Lets play wordle on my other monitor');
        assert.equal(captures.at(-1).id, 'monitor-two');
        assert.equal(calls.at(-1).args[1].taskReceipt, 'test-receipt');
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
