const OpenAI = require('openai');

let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return client;
}

async function complete(messages, options = {}) {
  const response = await getClient().chat.completions.create({
    model: options.model || process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
    messages,
    temperature: options.temperature ?? 0.7,
  });
  return response.choices[0].message.content;
}

module.exports = { complete };