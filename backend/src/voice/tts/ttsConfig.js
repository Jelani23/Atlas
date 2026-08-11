// backend/src/voice/tts/ttsConfig.js
const ttsConfig = {
    enabled: process.env.TTS_ENABLED === 'true',
    provider: process.env.TTS_PROVIDER || 'kokoro',
    voice: process.env.TTS_VOICE || 'af_heart',
    speed: Number(process.env.TTS_SPEED) || 1.0,
    
    // Provider-specific endpoints/settings
    kokoro: {
        url: process.env.KOKORO_URL || 'http://127.0.0.1:7860',
        endpoint: process.env.KOKORO_ENDPOINT || '/gradio_api/call/generate_speech',
        root: process.env.KOKORO_ROOT || '',
        autoStart: process.env.KOKORO_AUTOSTART === 'true',
        startupTimeout: Number(process.env.KOKORO_STARTUP_TIMEOUT || 15000)
    }
};

module.exports = ttsConfig;