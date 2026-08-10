// backend/src/voice/tts/ttsManager.js
const { createTtsAdapter } = require('./ttsAdapter');

let adapter = null;

function getAdapter() {
    if (!adapter) {
        adapter = createTtsAdapter();
    }
    return adapter;
}

async function speak(text, options = {}) {
    const isEnabled = process.env.TTS_ENABLED === 'true';
    if (!isEnabled || !text || text.trim() === '') {
        return null;
    }

    try {
        console.log(`[TTSManager] Synthesizing speech for: "${text.substring(0, 30)}..."`);
        const result = await getAdapter().synthesize(text, options);
        console.log(`[TTSManager] Audio synthesized successfully (${result.buffer.length} bytes)`);
        return result;
    } catch (error) {
        console.error(`[TTSManager] Synthesis failed:`, error.message);
        return null;
    }
}

module.exports = { speak };