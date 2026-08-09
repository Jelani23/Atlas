const OpenAI = require('openai');

// Constructed lazily so requiring this file never fails just because OPENAI_API_KEY
// isn't set yet (useful for tests, syntax checks, etc.)
let client;
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

async function complete(messages, options = {}) {
  const response = await getClient().chat.completions.create({
    model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: options.temperature ?? 0.7,
  });
  return response.choices[0].message.content;
}

module.exports = { complete };
