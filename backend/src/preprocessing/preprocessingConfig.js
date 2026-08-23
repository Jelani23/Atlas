// preprocessing/preprocessingConfig.js
//
// Central, env-driven configuration for the optional Groq (semantic) and
// Gemini (contextual) pre-contextualization layer.
//
// Everything is OFF by default:
//   - ATLAS_PREPROCESSING_ENABLED        master switch for the whole layer
//   - GROQ_SEMANTIC_PREPROCESSING         enable the Groq semantic stage
//   - GEMINI_CONTEXT_PREPROCESSING        enable the Gemini contextual stage
//
// Even when a stage is enabled it still short-circuits to a no-op unless
// the corresponding API key is present, so Atlas never fails (or spends
// money) because of a missing credential.

const config = {
  enabled: process.env.ATLAS_PREPROCESSING_ENABLED === 'true',

  groq: {
    enabled: process.env.GROQ_SEMANTIC_PREPROCESSING === 'true',
    apiKey: process.env.GROQ_API_KEY,
    // See groq.js's provider-level comment: llama-3.1-8b-instant is
    // decommissioned - this default must stay in sync with the fallback
    // there.
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    timeoutMs: Number(process.env.GROQ_PREPROCESSING_TIMEOUT_MS) || 8000,
  },

  gemini: {
    enabled: process.env.GEMINI_CONTEXT_PREPROCESSING === 'true',
    apiKey: process.env.GEMINI_API_KEY,
    // See gemini.js's provider-level comment: gemini-2.5-flash is 404ing.
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    timeoutMs: Number(process.env.GEMINI_PREPROCESSING_TIMEOUT_MS) || 15000,
  },
};

function isGroqAvailable() {
  return config.enabled && config.groq.enabled && !!config.groq.apiKey;
}

function isGeminiAvailable() {
  return config.enabled && config.gemini.enabled && !!config.gemini.apiKey;
}

module.exports = { config, isGroqAvailable, isGeminiAvailable };