const OpenAI = require('openai');

// Groq exposes an OpenAI-compatible chat completions API, so this provider
// is structurally identical to providers/openai.js - only the base URL and
// default model differ.
//
// Constructed lazily so requiring this file never fails just because
// GROQ_API_KEY isn't set yet (useful for tests, syntax checks, etc.).
let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return client;
}

async function complete(messages, options = {}) {
  // `timeout` is an SDK-level request option, NOT part of the chat
  // completions body - sending it in the body makes the API reject the
  // request with "400 property 'timeout' is unsupported".
  const { timeout, ...body } = options;
  const response = await getClient().chat.completions.create(
    {
      // Phase (decommissioned-model fix): llama-3.1-8b-instant was
      // deprecated by Groq (announced June 17 2026) and is now fully shut
      // down - every request that fell through to this hardcoded fallback
      // (or an unset/stale GROQ_MODEL env var) was getting a 400 from
      // Groq, caught by semanticAnalyzer.js's try/catch, and returning
      // null. That's the "Groq is being called but not doing anything"
      // symptom - the call goes out (and shows up in Groq's usage
      // dashboard) but never produces a usable profile. Groq's own
      // migration guide recommends openai/gpt-oss-20b as the replacement.
      model: body.model || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      messages,
      temperature: body.temperature ?? 0.2,
      ...(body.maxTokens !== undefined ? { max_tokens: body.maxTokens } : {}),
    },
    timeout !== undefined ? { timeout } : undefined
  );
  return response.choices[0].message.content;
}

module.exports = { complete };