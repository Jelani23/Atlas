const assert = require('node:assert/strict');
process.env.TTS_ENABLED = 'true';
process.env.TTS_PROVIDER = 'kokoro';
process.env.TTS_VOICE = 'fixture-voice';
let healthCalls = 0;
const adapterPath = require.resolve('../src/voice/tts/ttsAdapter');
require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true,
    exports: { createTtsAdapter: () => ({ healthCheck: async () => {
        healthCalls++;
        return { available: true, provider: 'kokoro' };
    } }) } };
const manager = require('../src/voice/tts/ttsManager');
async function main() {
    assert.deepEqual(manager.getStatus(), { enabled: true, provider: 'kokoro', voice: 'fixture-voice', health: 'unknown', checkedAt: null });
    assert.equal(healthCalls, 0);
    await manager.checkHealth();
    const observed = manager.getStatus();
    assert.equal(observed.health, 'available');
    assert(Number.isFinite(Date.parse(observed.checkedAt)));
    observed.health = 'tampered';
    assert.equal(manager.getStatus().health, 'available');
    assert.equal(healthCalls, 1, 'Reading health must not probe the service again');
    require('../src/voice/tts/ttsConfig').enabled = false;
    await manager.checkHealth();
    assert.equal(manager.getStatus().health, 'disabled');
    assert.equal(healthCalls, 1);
    console.log('TTS status is a read-only last-observation snapshot.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
