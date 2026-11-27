const assert = require('node:assert/strict');
const { createClientRegistry } = require('../src/devices/clientRegistry');
const { createClientSession } = require('../src/devices/clientSession');

async function main() {
    const registry = createClientRegistry();
    const pc = createClientSession(registry, {});
    const mac = createClientSession(registry, {});
    const identity = (id, displayName) => ({ schemaVersion: 1, deviceId: id, displayName, os: 'windows', clientType: 'electron', deviceKind: 'desktop' });
    const pcIdentity = identity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PC');
    const macIdentity = identity('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Mac');
    await assert.rejects(pc.dispatch('listDevices', [], {}), /Register/);
    await pc.dispatch('registerClient', [pcIdentity], {});
    await mac.dispatch('registerClient', [macIdentity], {});
    const screens = { observedAt: Date.now(), permission: 'unknown', displays: [{ id: '1', label: 'Desk display', width: 1920, height: 1080, scaleFactor: 1, rotation: 0, primary: true }] };
    let result = await pc.dispatch('listDevices', [screens], {});
    assert.equal(result.devices.length, 2);
    assert(result.devices.every(device => device.online));
    assert.equal(result.devices.filter(device => device.current).length, 1);
    assert.equal(result.devices[0].screens.displays[0].label, 'Desk display');
    await assert.rejects(pc.dispatch('listDevices', [{ ...screens, displays: [{ ...screens.displays[0], width: -1 }] }], {}), /dimensions/);
    pc.close();
    result = await mac.dispatch('listDevices', [], {});
    assert.equal(result.devices[0].online, false);
    assert.equal(result.devices[0].screens.displays.length, 1);
    const reconnect = createClientSession(registry, {});
    await reconnect.dispatch('registerClient', [pcIdentity], {});
    const duplicate = createClientSession(registry, {});
    await duplicate.dispatch('registerClient', [pcIdentity], {});
    reconnect.close();
    result = await mac.dispatch('listDevices', [], {});
    assert.equal(result.devices.length, 2, 'Reconnects and duplicate profiles do not duplicate devices');
    assert.equal(result.devices[0].online, true, 'One remaining connection keeps the device online');
    assert.equal(result.devices[0].screens.displays.length, 1);
    duplicate.close(); mac.close();
    console.log('deviceInventory tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
