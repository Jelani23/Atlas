// Every provider in ./providers must export complete(messages, options) -> Promise<string>.
// Nothing outside this file should ever import a provider directly - that's what keeps
// the LLM swappable per the "LLM is not the assistant" principle.
const providers = {
  openai: require('./providers/openai'),
  qwen: require('./providers/qwen'),
  deepseek: require('./providers/deepseek'),
  ollama: require('./providers/ollama'),
};

function createModelAdapter(providerName = process.env.ATLAS_MODEL_PROVIDER || 'ollama') {
  const provider = providers[providerName];
  if (!provider) {
    const available = Object.keys(providers).join(', ');
    throw new Error(`Unknown model provider "${providerName}". Available: ${available}`);
  }
  return provider;
}

module.exports = { createModelAdapter };
