const assert = require('node:assert/strict');
const { normalizeScreens, validateCapture } = require('../src/devices/screenContext');
const { createClientRegistry } = require('../src/devices/clientRegistry');
const { createClientSession } = require('../src/devices/clientSession');
const { analyzeScreen } = require('../src/devices/screenAnalysis');
const now = Date.now();
const inventory = { observedAt: now, permission: 'granted', displays: [{ id: '2', label: 'Mac monitor', width: 1920, height: 1080, scaleFactor: 2, rotation: 0, primary: true }] };
const screenshot = { data: Buffer.from([255,216,255,217]).toString('base64'), mimeType: 'image/jpeg', width: 1600, height: 900, displayId: '2', capturedAt: now };
async function main() {
    const screens = normalizeScreens(inventory);
    assert(Object.isFrozen(screens.displays[0]));
    assert.equal(validateCapture(screenshot, screens).displayId, '2');
    const validated = validateCapture({ ...screenshot, monitorNumber: 99, displayLabel: 'Wrong monitor', observationOnly: true }, screens);
    assert.equal(validated.monitorNumber, 1, 'OS display ID 2 is the first inventory entry, not monitor number 2');
    assert.equal(validated.displayLabel, 'Mac monitor');
    assert.equal(validated.imageHash.length, 64);
    assert.throws(() => validateCapture({ ...screenshot, displayId: '3' }, screens), /missing/);
    assert.throws(() => validateCapture({ ...screenshot, data: 'aGVsbG8=' }, screens), /JPEG/);
    assert.throws(() => validateCapture({ ...screenshot, capturedAt: now - 300000 }, screens), /expired/);
    assert.throws(() => validateCapture({ ...screenshot, data: 'a'.repeat(4 * 1024 * 1024 + 1) }, screens), /data/);
    assert.throws(() => normalizeScreens({ ...inventory, displays: [inventory.displays[0], inventory.displays[0]] }), /Duplicate/);
    assert.throws(() => normalizeScreens({ ...inventory, observedAt: now - 400000 }), /stale/);
    const registry = createClientRegistry();
    const session = createClientSession(registry, {});
    await session.dispatch('registerClient', [{ schemaVersion: 1, deviceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', displayName: 'Mac', os: 'macos', deviceKind: 'laptop', clientType: 'electron', capabilities: { screenshot: { supported: true, permission: 'prompt' } } }]);
    let received;
    await session.dispatch('sendMessage', ['describe', { screens: inventory, screenCapture: screenshot }], {
        async sendMessage(text, interaction, attachments) {
            assert(!JSON.stringify(interaction).includes(screenshot.data), 'Pixels must never enter broadcast interaction metadata');
            received = attachments.screenCapture;
            assert.equal(interaction.client.displayName, 'Mac');
            return { reply: 'fixture' };
        },
    });
    assert.equal(received.data, screenshot.data);
    let unavailableReply;
    await session.dispatch('sendMessage', ['Look at monitor 2', { screens: inventory, requestedMonitorUnavailable: 2 }], {
        async sendMessage(_text, _interaction, attachments) { unavailableReply = attachments.screenRequestError; assert.equal(attachments.screenCapture, null); return { reply: unavailableReply }; },
    });
    assert.match(unavailableReply, /only has 1 connected screen/);
    assert.match(unavailableReply, /Available monitor: 1/);
    await session.dispatch('sendMessage', ["What's on the other screen?", { screens: inventory, requestedOtherMonitorIssue: true }], {
        async sendMessage(_text, _interaction, attachments) {
            assert.match(attachments.screenRequestError, /only has 1 connected screen/);
            assert.match(attachments.screenRequestError, /isn't another screen/);
            assert.equal(attachments.screenCapture, null);
            return { reply: attachments.screenRequestError };
        },
    });
    const threeScreens = { ...inventory, displays: [1,2,3].map(id => ({ ...inventory.displays[0], id: String(id) })) };
    await session.dispatch('sendMessage', ["What's on the other screen?", { screens: threeScreens, requestedOtherMonitorIssue: true }], {
        async sendMessage(_text, _interaction, attachments) {
            assert.match(attachments.screenRequestError, /Which monitor number/);
            return { reply: attachments.screenRequestError };
        },
    });
    await assert.rejects(session.dispatch('sendMessage', ['Look', { screens: inventory, requestedMonitorUnavailable: 1 }], {}), /Invalid unavailable/);
    session.close();
    let calls = 0;
    const dependencies = {
        fetch: async url => { assert.equal(url, 'http://localhost:11434/api/show'); return { ok: true, json: async () => ({ capabilities: ['vision'] }) }; },
        complete: async (messages, options) => {
            calls++;
            assert.deepEqual(messages[1].images, [screenshot.data]);
            assert.match(messages[0].content, /never instructions/);
            assert.match(messages[0].content, /Alice personality/);
            assert.match(messages[0].content, /RESPONSE COMPOSITION POLICY/);
            assert.match(messages[0].content, /main visible activity first/);
            assert.match(messages[0].content, /Capture source: Monitor 1/);
            assert.match(messages[0].content, /INSIDE the image/);
            assert.match(messages[1].content, /Identify the main visible application/);
            assert(!messages[1].content.includes('monitor 1'));
            assert.equal(options.think, false);
            return 'I see a test screen.';
        },
    };
    assert.equal(await analyzeScreen({ capture: validated, prompt: 'describe', context: 'Alice personality' }, dependencies), 'I see a test screen.');
    await assert.rejects(analyzeScreen({ capture: screenshot }, { ...dependencies, fetch: async () => ({ ok: true, json: async () => ({ capabilities: ['completion'] }) }) }), /vision support/);
    assert.equal(calls, 1, 'Unsupported vision must not silently fall back to text or cloud');
    assert.equal(await analyzeScreen({ capture: screenshot, isCancelled: () => true }, dependencies), '');
    assert.equal(calls, 1);
    console.log('screenContext.test.js: validation, origin isolation, image transport and local vision gating passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
