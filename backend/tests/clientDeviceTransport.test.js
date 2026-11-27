// Real server/WebSocket transport with external services replaced by a small
// interface fixture. No model, database, STT service or TTS service is contacted.
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter, once } = require('node:events');
const WebSocket = require('ws');
const fs = require('node:fs');
const path = require('node:path');
const deviceDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'atlas-device-transport-'));
process.env.ATLAS_DEVICE_STORE_FILE = path.join(deviceDirectory, 'devices.json');
const { getInteraction } = require('../src/devices/interactionContext');
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
class AtlasFixture extends EventEmitter {
    async initialize() {}
    async sendMessage(text, interaction) {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(getInteraction(), interaction);
        return { reply: interaction.client?.displayName || 'unknown', interaction };
    }
    async transcribeAudio() { return { ok: true, text: 'device?' }; }
}
stub('dotenv', { config() {} });
stub('../src/interface/atlasInterface', { AtlasInterface: AtlasFixture });
stub('../src/voice/tts/ttsManager', { async checkHealth() {} });
stub('../src/voice/tts/providers/kokoroProcess', {});
process.env.ATLAS_PORT = '0';
let server;
const originalCreateServer = http.createServer;
http.createServer = (...args) => { server = originalCreateServer(...args); return server; };
require('../src/server');
http.createServer = originalCreateServer;
let nextId = 0;
async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    await once(ws, 'open');
    return ws;
}
async function rpc(ws, method, args = []) {
    const id = ++nextId;
    const reply = once(ws, 'message');
    ws.send(JSON.stringify({ id, method, args }));
    const message = JSON.parse((await reply)[0]);
    assert.equal(message.id, id);
    if (message.error) throw new Error(message.error);
    return message.result;
}
function registration(name, os, digit) {
    return { schemaVersion: 1, deviceId: `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`, displayName: name, os, deviceKind: 'laptop', clientType: 'electron' };
}
async function main() {
    const sockets = [];
    try {
        if (!server.listening) await once(server, 'listening');
        const pc = await connect(); sockets.push(pc);
        const mac = await connect(); sockets.push(mac);
        const pcDevice = await rpc(pc, 'registerClient', [registration('Windows PC', 'windows', 'a')]);
        await rpc(mac, 'registerClient', [registration('MacBook', 'macos', 'b')]);
        const screens = { observedAt: Date.now(), permission: 'unknown', displays: [{ id: '1', label: 'Desk monitor', width: 1920, height: 1080, scaleFactor: 1, rotation: 0, primary: true }] };
        const inventory = await rpc(pc, 'listDevices', [screens]);
        assert.equal(inventory.devices.length, 2);
        assert(inventory.devices.every(device => device.online));
        assert.equal(inventory.devices.find(device => device.current).client.displayName, 'Windows PC');
        const remoteInventory = await rpc(mac, 'listDevices');
        assert.equal(remoteInventory.devices.find(device => !device.current).screens.displays[0].label, 'Desk monitor');
        await assert.rejects(rpc(pc, 'listDevices', [{ ...screens, displays: [{ ...screens.displays[0], width: -1 }] }]), /dimensions/);
        const replies = await Promise.all([rpc(pc, 'sendMessage', ['device?']), rpc(mac, 'sendMessage', ['device?'])]);
        assert.deepEqual(replies.map(r => r.reply), ['Windows PC', 'MacBook']);
        assert.equal(replies[0].interaction.connectionId, pcDevice.connectionId);
        const voice = await rpc(mac, 'transcribeAudio', ['audio']);
        await assert.rejects(rpc(pc, 'sendMessage', [voice.text, voice]), /transcript/);
        const answer = await rpc(mac, 'sendMessage', [voice.text, voice]);
        assert.equal(answer.interaction.inputSource, 'voice');
        assert.equal(answer.reply, 'MacBook');
        const malformedReply = once(pc, 'message'); pc.send('{bad json');
        assert(JSON.parse((await malformedReply)[0]).error);
        assert.equal((await rpc(pc, 'getClientDevice')).client.displayName, 'Windows PC', 'Malformed messages do not crash the server');
        const pcClosed = once(pc, 'close'); pc.close(); await pcClosed;
        // The peer's close event can arrive before the server finishes closing
        // its side. Wait for that observable transition, with a bounded deadline.
        let offline;
        for (let attempt = 0; attempt < 50; attempt++) {
            offline = await rpc(mac, 'listDevices');
            if (!offline.devices.find(device => !device.current).online) break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(offline.devices.find(device => !device.current).online, false);
        const reconnect = await connect(); sockets.push(reconnect);
        const restored = await rpc(reconnect, 'registerClient', [registration('Windows PC', 'windows', 'a')]);
        assert.equal(restored.client.deviceId, pcDevice.client.deviceId);
        assert.notEqual(restored.connectionId, pcDevice.connectionId);
        const reconnected = await rpc(reconnect, 'listDevices');
        assert.equal(reconnected.devices.length, 2);
        assert(reconnected.devices.every(device => device.online));
        console.log('clientDeviceTransport.test.js: all assertions passed');
    } finally {
        await Promise.all(sockets.filter(ws => ws.readyState !== WebSocket.CLOSED).map(async ws => {
            const closed = once(ws, 'close'); ws.close(); await closed;
        }));
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(deviceDirectory, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
