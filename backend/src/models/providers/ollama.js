// Ollama local provider
// Connects Atlas to locally hosted models through Ollama's API.

async function complete(messages, options = {}) {

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
      messages,
      stream: false,
      think: options.think ?? false,
      // Ollama's own residency lever. Omit the field entirely when the caller
      // doesn't specify one, so we fall back to Ollama's default (5m) rather
      // than silently forcing a value.
      ...(options.keepAlive !== undefined ? { keep_alive: options.keepAlive } : {}),
      options: {
        temperature: options.temperature ?? 0.7,
        num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
        // Hard ceiling on generated tokens. Undefined = Ollama's own default
        // (effectively unbounded) - only set this where a caller actually
        // wants brevity enforced, not just requested via prompt.
        ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
      }
    }),
  });


  if (!response.ok) {
    throw new Error(
      `Ollama request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.message.content;
}


module.exports = { complete };