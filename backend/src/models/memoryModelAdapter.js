const { createModelAdapter } = require('./modelAdapter');

// Optional routing for ingestion work only. The conversational adapter and
// provider singletons are never modified; an unset override preserves defaults.
function createMemoryModelAdapter(providerName = process.env.ATLAS_MODEL_PROVIDER || 'ollama') {
    const adapter = createModelAdapter(providerName);
    return {
        ...adapter,
        complete(messages, options = {}) {
            const configured = providerName === 'ollama' ? process.env.OLLAMA_MODEL_MEMORY?.trim() : '';
            const requestOptions = configured && !options.model ? { ...options, model: configured } : options;
            return adapter.complete(messages, requestOptions);
        }
    };
}

module.exports = { createMemoryModelAdapter };
