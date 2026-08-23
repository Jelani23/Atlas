// backend/src/models/modelAdapter.js
const providers = {
  openai: require('./providers/openai'),
  qwen: require('./providers/qwen'),
  deepseek: require('./providers/deepseek'),
  ollama: require('./providers/ollama'),
  groq: require('./providers/groq'),
  gemini: require('./providers/gemini'),
};

function createModelAdapter(providerName = process.env.ATLAS_MODEL_PROVIDER || 'ollama') {
  const provider = providers[providerName];
  if (!provider) {
    const available = Object.keys(providers).join(', ');
    throw new Error(`Unknown model provider "${providerName}". Available: ${available}`);
  }
  
  // Safety check to ensure the provider supports streaming
  if (!provider.streamComplete) {
    console.warn(`[ModelAdapter] Provider ${providerName} does not support streaming.`);
  }
  
  return provider;
}

module.exports = { createModelAdapter };