// backend/src/models/providers/ollama.js

// Standard completion (for background tasks, JSON extraction, etc.)
async function complete(messages, options = {}) {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
      messages,
      stream: false,
      think: options.think ?? false,
      ...(options.keepAlive !== undefined ? { keep_alive: options.keepAlive } : {}),
      options: {
        temperature: options.temperature ?? 0.7,
        num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
        ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.message.content;
}

// Streaming completion (for main UI replies)
async function* streamComplete(messages, options = {}) {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
      messages,
      stream: true, // Streaming enabled!
      think: options.think ?? false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
        ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama stream request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Keep the last partial line in the buffer
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message && data.message.content) {
          yield data.message.content;
        }
      } catch (e) {
        console.error('[OllamaProvider] Failed to parse stream JSON:', e);
      }
    }
  }
}

module.exports = { complete, streamComplete };