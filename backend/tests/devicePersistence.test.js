const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDeviceStore } = require('../src/devices/deviceStore');
const { createClientRegistry } = require('../src/devices/clientRegistry');
const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'atlas-device-store-'));
const filename = path.join(directory, 'devices.json');
const identity = (digit, displayName) => ({ schemaVersion: 1, deviceId: `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`, displayName, os: 'windows', clientType: 'electron', deviceKind: 'desktop' });
try {
    let clock = Date.now();
    const registry = createClientRegistry({ store: createDeviceStore(filename), now: () => clock });
    const pc = registry.connect({}), mac = registry.connect({});
    registry.register(pc, identity('a', 'PC'));
    registry.register(mac, identity('b', 'MacBook'));
    registry.listDevices(mac, { observedAt: clock, permission: 'unknown', displays: [{ id: '1', label: 'Mac display', width: 1440, height: 900, scaleFactor: 2, rotation: 0 }] });
    registry.disconnect(mac);
    for (let i = 0; i < 3; i++) {
        const refreshed = registry.listDevices(pc);
        assert.equal(refreshed.devices.length, 2);
        assert.equal(refreshed.devices[1].online, false);
    }
    // Simulate a crash while PC is still online: persisted online flags must
    // never make a device appear connected after a backend restart.
    clock += 86400000;
    const restarted = createClientRegistry({ store: createDeviceStore(filename), now: () => clock });
    assert(restarted.inventory().devices.every(device => !device.online));
    const pcAgain = restarted.connect({});
    restarted.register(pcAgain, identity('a', 'Renamed PC'));
    const result = restarted.listDevices(pcAgain);
    assert.equal(result.devices.length, 2);
    assert.equal(result.devices[0].client.displayName, 'Renamed PC');
    assert.equal(result.devices[1].online, false);
    assert.equal(result.devices[1].screens.displays[0].label, 'Mac display');
    const macAgain = restarted.connect({});
    restarted.register(macAgain, identity('b', 'MacBook'));
    assert(restarted.listDevices(pcAgain).devices.every(device => device.online));
    assert(!fs.readFileSync(filename, 'utf8').includes('"online"'));
    assert(!fs.existsSync(`${filename}.tmp`));
    fs.writeFileSync(filename, '{broken');
    assert.throws(() => createClientRegistry({ store: createDeviceStore(filename) }), /Cannot read remembered devices/);
    assert.equal(fs.readFileSync(filename, 'utf8'), '{broken', 'Unreadable history must not be silently overwritten');
    console.log('devicePersistence: refresh, restart, reconnect, retained monitors, rename and corrupt storage passed');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
