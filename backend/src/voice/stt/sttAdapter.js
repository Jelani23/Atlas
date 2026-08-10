// backend/src/voice/stt/sttAdapter.js
const providers = {
  'faster-whisper': require('./providers/fasterWhisper'),
  // Future: 'whisper-cpp': require('./providers/whisperCpp'),
  // Future: 'parakeet': require('./providers/parakeet'),
};

function createSttAdapter(providerName = process.env.STT_PROVIDER || 'faster-whisper') {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown STT provider "${providerName}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

module.exports = { createSttAdapter };