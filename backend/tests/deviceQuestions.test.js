const assert = require('node:assert/strict');
const parser = require('../src/intent/inputUnderstanding');
const { prepare } = require('../src/intent/prepareInput');
const { createClientRegistry } = require('../src/devices/clientRegistry');
const { createClientSession } = require('../src/devices/clientSession');
const { normalize, render } = require('../src/response/deviceResponse');
const builder = require('../src/response/responseBuilder');
const state = require('../src/planner/state');
const clause = (text, domain = 'devices', kind = 'request') => ({ text, kind, domain, action: kind === 'chat' ? 'none' : 'read', confidence: 1, target: { relative: 'default', monitor: 0 } });
const context = { sessionId: 'device-questions', interaction: { connectionId: 'pc' }, screens: null };
async function main() {
    for (const text of ['Which devices are connected?', 'Is my MacBook online?', 'What can my computers do?', 'And what about its microphone?']) {
        const result = await prepare(text, context, { complete: async messages => {
            assert.match(messages[0].content, /devices\/read/);
            return JSON.stringify({ clauses: [clause(text)] });
        } });
        assert.equal(result.task, 'devices');
        assert.equal(result.action, 'read');
        assert.equal(result.displayId, undefined, 'Metadata queries must never request a capture');
    }
    for (const text of ['What device am I currently messaging from?', "Yeah but do you know what device I'm currently using?"]) {
        const query = { scope: 'current', topic: 'status', name: '' };
        const result = await prepare(text, context, { complete: async () => JSON.stringify({ clauses: [{ ...clause(text), deviceQuery: query }] }) });
        assert.deepEqual(result.query, query);
    }
    const chat = 'Explain how computers connect to networks';
    assert.equal(parser.decide(chat, { clauses: [clause(chat, 'general', 'chat')] }).disposition, 'chat');
    const mixed = 'List devices; look at my screen';
    assert.equal(parser.decide(mixed, { clauses: [clause('List devices;'), { ...clause('look at my screen', 'screen'), action: 'inspect' }] }).disposition, 'clarify');
    const registry = createClientRegistry();
    const pc = createClientSession(registry, {}), mac = createClientSession(registry, {});
    const identity = (digit, name) => ({ schemaVersion: 1, deviceId: `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`, displayName: name, os: 'windows', deviceKind: 'desktop', clientType: 'electron', capabilities: { textInput: { supported: true, permission: 'not-required' }, microphone: { supported: true, permission: 'unknown' } } });
    const atlas = { sessionId: context.sessionId, sendMessage: async (_text, interaction, options) => {
        assert.equal(options.taskIntent.task, 'devices');
        assert.equal(interaction.deviceInventory.devices[1].online, false, 'Read current status after preparation');
        const response = await builder.compose({ result: normalize(interaction.deviceInventory, { scope: 'all', topic: 'capabilities', name: '' }) }, { complete: () => { throw new Error('Device facts must not be invented by a model'); } });
        assert.equal(response.composition.source, 'grounded-devices');
        return { reply: response.display };
    } };
    await pc.dispatch('registerClient', [identity('a', 'PC')], atlas);
    await mac.dispatch('registerClient', [identity('b', 'MacBook')], atlas);
    const inventory = registry.inventory(pc.connectionId);
    const currentQuery = { scope: 'current', topic: 'status', name: '' };
    assert.equal(render(inventory, currentQuery), 'You’re messaging me from PC, running Windows.');
    assert.equal(render(registry.inventory(mac.connectionId), currentQuery), 'You’re messaging me from MacBook, running Windows.');
    assert(!render(registry.inventory(), currentQuery).includes('PC'), 'Missing origin must not guess an online computer');
    const list = render(inventory);
    assert.match(list, /PC — online/);
    assert.match(list, /MacBook — online/);
    assert(!/permission|camera|Last seen/.test(list), 'A list request must stay concise');
    const named = render(inventory, { scope: 'named', topic: 'capabilities', name: 'MacBook' });
    assert.match(named, /microphone \(permission not checked\)/);
    assert(!named.includes('PC'), 'Named capability questions must not repeat the whole inventory');
    assert.match(render(inventory, { scope: 'named', topic: 'status', name: 'Phone' }), /don’t have a registered device/);
    const currentResponse = await builder.compose({ result: normalize(inventory, currentQuery) });
    assert.equal(currentResponse.display, 'You’re messaging me from PC, running Windows.');
    assert.equal(currentResponse.speech, currentResponse.display);
    const preparation = require('../src/intent/prepareInput');
    const original = preparation.prepare;
    preparation.prepare = async () => ({ task: 'devices', action: 'read' });
    try {
        const text = 'Which devices are connected?';
        const prepared = await pc.dispatch('prepareTask', [text, null], atlas);
        mac.close();
        const response = await pc.dispatch('sendMessage', [text, { taskReceipt: prepared.taskReceipt }], atlas);
        assert.match(response.reply, /PC — online/);
        assert.match(response.reply, /MacBook — offline/);
        assert.match(response.reply, /microphone \(permission not checked\)/);
        assert.match(response.reply, /Not supported: .*camera/);
        await assert.rejects(pc.dispatch('sendMessage', [text, { taskReceipt: prepared.taskReceipt }], atlas), /expired/);
    } finally { preparation.prepare = original; pc.close(); state.endSession(context.sessionId); }
    console.log('deviceQuestions: parser domain, metadata-only route, fresh snapshot, capability response and receipt binding passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
