const assert = require('node:assert/strict');
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../src/core/personalityEngine', { getSystemPrompt: () => 'Alice personality retained', usesConciseProfile: () => true, getReplyFocus: () => '' });
stub('../src/core/capabilityContext', { buildCapabilityContext: () => '', selectTopics: () => [] });
stub('../src/core/contextManager', { getRelevantContext: () => { throw new Error('Unexpected retrieval'); } });
stub('../src/memory/profileRecall', { selectPersonalContext: () => [] });
const { buildContext } = require('../src/core/contextBuilder');
const { normalizeClient } = require('../src/devices/clientRegistry');
async function main() {
    const base = { mode: 'casual', userInput: 'Which device am I using?', history: [], preprocessed: { relevantMemory: { hotState: { activeFiles: [] } } } };
    const mac = normalizeClient({ schemaVersion: 1, deviceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', displayName: 'MacBook', os: 'macos', deviceKind: 'laptop', clientType: 'electron' });
    const context = await buildContext({ ...base, interaction: { client: mac, inputSource: 'text' } });
    assert.match(context, /Alice personality retained/);
    assert.match(context, /"displayName":"MacBook"/);
    assert.match(context, /"os":"macos"/);
    assert.match(context, /Backend host OS:/);
    assert.match(context, /Camera capture is not implemented/);
    const unknown = await buildContext(base);
    assert.match(unknown, /Client device: unknown/);
    assert(!unknown.includes('MacBook'), 'A previous client must not leak into the next context');
    console.log('clientDeviceContext.test.js: all assertions passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
