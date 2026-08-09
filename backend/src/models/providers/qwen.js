const OpenAI = require('openai');

// Qwen is accessed through OpenRouter, which exposes an OpenAI-compatible API.
// Only the base URL, auth, and default model differ from providers/openai.js -
// the request/response shape is identical.
let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return client;
}

async function complete(messages, options = {}) {
  const response = await getClient().chat.completions.create({
    model: options.model || process.env.QWEN_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    // OpenRouter/vLLM read this straight off the request body for open-weight
    // Qwen3 hybrid-thinking models. (The JS OpenAI SDK has no "extra_body"
    // concept - that's Python-only - so wrapping it wasn't doing anything.)
    chat_template_kwargs: {
      enable_thinking: options.think ?? false
    }
  });

  return response.choices[0].message.content;
}

module.exports = { complete };
