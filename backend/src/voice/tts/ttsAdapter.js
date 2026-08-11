// backend/src/voice/tts/ttsAdapter.js
const config = require('./ttsConfig');

const providers = {
  'kokoro': require('./providers/kokoro'),
  // Future: 'piper': require('./providers/piper'),
  // Future: 'elevenlabs': require('./providers/elevenlabs'),
};

function createTtsAdapter() {
  const providerName = config.provider;
  const provider = providers[providerName];
  
  if (!provider) {
    throw new Error(`Unknown TTS provider "${providerName}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

module.exports = { createTtsAdapter };