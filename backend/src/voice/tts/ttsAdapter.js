// backend/src/voice/tts/ttsAdapter.js
const providers = {
  'kokoro': require('./providers/kokoro'),
  // Future: 'piper': require('./providers/piper'),
  // Future: 'elevenlabs': require('./providers/elevenlabs'),
};

function createTtsAdapter(providerName = process.env.TTS_PROVIDER || 'kokoro') {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown TTS provider "${providerName}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

module.exports = { createTtsAdapter };