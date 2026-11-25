const assert = require('node:assert/strict');
const { createScreenAwareness, isScreenRequest, parseScreenRequest } = require('../electron/screenAwareness');
const displays = [1, 2].map(id => ({ id, label: `Monitor ${id}`, size: { width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0 }));
async function main() {
    let permission = 'granted', captures = 0, active = displays, sourceId = '2';
    const service = createScreenAwareness({
        platform: 'darwin', now: () => 100,
        screen: { getAllDisplays: () => active, getPrimaryDisplay: () => displays[0], getDisplayMatching: () => displays[1] },
        systemPreferences: { getMediaAccessStatus: () => permission },
        dialog: { showMessageBox: () => { throw new Error('Unexpected application permission popup'); } },
        desktopCapturer: { getSources: async options => {
            captures++;
            assert.deepEqual(options.types, ['screen']);
            return [{ display_id: sourceId, thumbnail: { isEmpty: () => false, getSize: () => ({ width: 1600, height: 900 }), toJPEG: () => Buffer.from([255,216,255,217]) } }];
        } },
    });
    const window = { isDestroyed: () => false, getBounds: () => ({}) };
    assert.equal(service.inventory(window).displays[1].current, true);
    assert.equal(captures, 0, 'Inventory must never capture pixels');
    const image = await service.capture(window, '2');
    assert.equal(image.displayId, '2'); assert.equal(image.capturedAt, 100); assert.equal(captures, 1);
    permission = 'denied';
    await assert.rejects(service.capture(window, '2'), /permission is denied/);
    assert.equal(captures, 1);
    permission = 'granted'; sourceId = '1';
    await assert.rejects(service.capture(window, '2'), /could not be uniquely captured/);
    active = [displays[0]];
    await assert.rejects(service.capture(window, '2'), /no longer connected/);
    const chosen = await service.capture(window, '1');
    assert.equal(chosen.displayId, '1');
    for (const text of ['describe my screen', 'Please look at my screen.', "What's on my screen?", 'take a screenshot', "Can you tell me what's going on in my screen?", 'Could you describe my screen on monitor 2?']) assert(isScreenRequest(text), text);
    for (const text of ['Can you see my screen?', "Don't take a screenshot", 'How do I take a screenshot?', 'describe my screen and delete files']) assert(!isScreenRequest(text));
    // Intentionally reverse source enumeration; selection must use IDs, not order.
    let confirmations = 0, connectedDisplays = displays;
    const multi = createScreenAwareness({
        platform: 'win32', screen: { getAllDisplays: () => connectedDisplays, getPrimaryDisplay: () => displays[0], getDisplayMatching: () => displays[0] },
        dialog: { showMessageBox: async () => { confirmations++; return { response: 1 }; } },
        desktopCapturer: { getSources: async () => [2,1].map(id => ({ id: `screen:${id}:0`, display_id: String(id), thumbnail: {
            isEmpty: () => false, getSize: () => ({ width: 1600, height: 900 }), toJPEG: () => Buffer.from([255,216,255,id]),
        } })) },
    });
    const first = await multi.capture(window, '1');
    const second = await multi.capture(window, '2');
    assert.equal(first.displayId, '1'); assert.equal(second.displayId, '2');
    assert.notEqual(first.imageHash, second.imageHash);
    assert.equal(multi.inventory(window).selectedDisplayId, '2');
    assert.equal((await multi.capture(window, undefined, { requested: true, text: "Can you tell me what's going on in my screen?" })).displayId, '2');
    assert.equal((await multi.capture(window, undefined, { requested: true, text: 'describe my screen on monitor 1' })).displayId, '1');
    assert.equal(confirmations, 0, 'Manual and natural-language requests must never show application dialogs');
    // Replay the user's exact sequence, not just isolated parser matches.
    for (const [text, expected] of [
        ["Alright can you tell me what's happening on monitor 1?", '1'],
        ["Tell me what's happening on this screen?", '1'],
        ["Can you tell me what's shown on my other screen?", '2'],
        ["Well then can you tell me what's happening on my other screen then?", '1'],
        ["Okay, so can you tell me what\u2019s shown on this screen?", '1'],
    ]) {
        assert(isScreenRequest(text), text);
        assert.equal((await multi.capture(window, undefined, { requested: true, text })).displayId, expected, text);
    }
    connectedDisplays = [...displays, { ...displays[0], id: 3 }];
    await assert.rejects(multi.capture(window, undefined, { requested: true, text: "What's on my other screen?" }), error => error.code === 'SCREEN_OTHER' && /3 connected/.test(error.message));
    connectedDisplays = [displays[1]];
    await assert.rejects(multi.capture(window, undefined, { requested: true, text: "What's on my other screen?" }), error => error.code === 'SCREEN_OTHER');
    assert.equal((await multi.capture(window, undefined, { requested: true, text: 'look at my screen' })).displayId, '2', 'A single remaining physical display is logical monitor 1');
    assert.equal((await multi.capture(window, undefined, { requested: true, text: 'look at monitor one' })).displayId, '2');
    await assert.rejects(multi.capture(window, undefined, { requested: true, text: 'look at monitor two' }), error => error.code === 'SCREEN_RANGE' && error.requestedMonitor === 2 && /1 connected screen/.test(error.message));
    for (const [text, number] of [['Look at monitor 2',2], ['Can you tell me what is happening on my second monitor?',2], ['Take a screenshot of monitor one',1], ['What do you see on screen 1?',1], ['Check my first monitor',1], ['Can you describe monitor 3 for me?',3], ['Capture a screenshot of display 0',0]]) assert.equal(parseScreenRequest(text)?.monitorNumber, number, text);
    for (const text of ['Do not look at monitor 2', 'How can I take a screenshot of monitor 1?', 'I took a screenshot of monitor 2', 'look at monitor 1 and delete files']) assert.equal(parseScreenRequest(text), null, text);
    console.log('screenAwareness.test.js: direct capture without popups, selection, OS denial and no fallback passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
