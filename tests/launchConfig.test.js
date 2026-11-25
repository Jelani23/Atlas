const assert = require('node:assert/strict');
const { resolveLaunchConfig, developmentCommands } = require('../electron/launchConfig');
const config = require('../atlas.config.json');
const resolve = (platform, hostname, env = {}) => resolveLaunchConfig({ config, platform, hostname, env });
const host = resolve('win32', 'DESKTOP-ALHAOC4');
assert.equal(host.role, 'host');
assert.equal(host.backendUrl, 'ws://127.0.0.1:7341/');
assert.equal(host.shutdownBackendOnExit, true);
assert.deepEqual(developmentCommands(host).map(c => c.name), ['RENDERER', 'BACKEND', 'ELECTRON']);
for (const [platform, hostname] of [['darwin', 'wsu-rl2lwxyfhx'], ['linux', 'other'], ['win32', 'another-pc']]) {
    const client = resolve(platform, hostname);
    assert.equal(client.role, 'client');
    assert.equal(client.backendUrl, 'ws://100.120.153.51:7341/');
    assert.equal(client.shutdownBackendOnExit, false);
    assert.deepEqual(developmentCommands(client).map(c => c.name), ['RENDERER', 'ELECTRON']);
    assert.equal(client.rendererUrl, 'http://localhost:3000');
}
assert.equal(resolve('win32', 'DESKTOP-ALHAOC4', { ATLAS_ROLE: 'client' }).role, 'client');
assert.equal(resolve('darwin', 'mac', { ATLAS_ROLE: 'host', ATLAS_PORT: '8000' }).backendUrl, 'ws://127.0.0.1:8000/');
assert.equal(resolve('darwin', 'mac', { ATLAS_WS_URL: 'wss://example.test:443' }).backendUrl, 'wss://example.test/');
assert.throws(() => resolve('win32', 'DESKTOP-ALHAOC4', { ATLAS_WS_URL: config.backendUrl }), /Host mode must connect/);
assert.throws(() => resolve('darwin', 'mac', { ATLAS_ROLE: 'invalid' }), /ATLAS_ROLE/);
assert.throws(() => resolve('darwin', 'mac', { ATLAS_WS_URL: 'https://example.test' }), /Backend URL/);
assert.throws(() => resolve('darwin', 'mac', { ATLAS_WS_URL: 'ws://user:secret@example.test' }), /Backend URL/);
assert.throws(() => resolve('win32', 'DESKTOP-ALHAOC4', { ATLAS_PORT: '99999' }), /ATLAS_PORT/);
assert.throws(() => resolveLaunchConfig({ env: {}, config: {}, platform: 'darwin' }), /Client mode needs/);
console.log('launchConfig.test.js: host detection, other platforms, launch plans and overrides passed');
