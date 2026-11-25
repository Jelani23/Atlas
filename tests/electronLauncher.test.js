const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const entry = require.resolve('../scripts/startElectron');

async function exercise(role) {
    const originalLoad = Module._load;
    const before = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, process.listeners(signal)]));
    let spawned = false;
    const launch = { role, backendUrl: 'ws://example.test:7341/', port: '7341', rendererUrl: 'http://localhost:3000' };
    Module._load = function(request, parent, ...args) {
        if (parent?.filename === entry) {
            if (request === '../electron/launchConfig') return { readConfig: () => ({}), resolveLaunchConfig: () => launch };
            if (request === 'wait-on') return async options => {
                assert.deepEqual(options.resources, role === 'host'
                    ? ['http://localhost:3000', 'http://127.0.0.1:7341/health']
                    : ['http://localhost:3000']);
            };
            if (request === 'electron') return 'electron-fixture';
            if (request === 'node:child_process') return { spawn(binary, args, options) {
                spawned = true;
                assert.equal(binary, 'electron-fixture');
                assert.deepEqual(args, ['.']);
                assert.equal(options.windowsHide, false, 'The interactive Electron process must not be hidden on Windows');
                assert.equal(options.env.ATLAS_ROLE, role);
                assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
                return new EventEmitter();
            } };
        }
        return originalLoad.call(this, request, parent, ...args);
    };
    try {
        delete require.cache[entry];
        require(entry);
        await new Promise(resolve => setImmediate(resolve));
        assert(spawned);
    } finally {
        Module._load = originalLoad;
        for (const [signal, listeners] of before) {
            for (const listener of process.listeners(signal)) if (!listeners.includes(listener)) process.removeListener(signal, listener);
        }
    }
}
(async () => {
    await exercise('host');
    await exercise('client');
    console.log('electronLauncher.test.js: visible Electron spawn and role-specific readiness checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
