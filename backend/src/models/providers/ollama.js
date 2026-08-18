// backend/src/models/providers/ollama.js
const http = require('http');
const { eventBus } = require('../../events/eventBus');
const EventTypes = require('../../events/eventTypes');

async function complete(messages, options = {}) {
  const body = {
    model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
    messages,
    stream: false,
    think: options.think ?? false,
    keep_alive: options.keepAlive || Number(process.env.OLLAMA_KEEP_ALIVE) || 1800,
    options: {
      temperature: options.temperature ?? 0.7,
      num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
      ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
    }
  };

  // When the caller passes `format`, forward it as Ollama's native
  // structured-output constraint (either the string "json" or a full
  // JSON Schema object). This makes Ollama's decoder itself refuse to
  // emit anything but conforming JSON, token by token - it is not a
  // prompt instruction the model can choose to ignore.
  //
  // This matters because `think: false` only disables the model's
  // dedicated <think> reasoning channel - it does NOT stop a model
  // from writing reasoning-as-prose directly into the regular content
  // field for a task that "feels like" it needs working-out, which is
  // exactly what was happening here: qwen3:4b would spend its entire
  // token budget on prose like "We are given: ... Steps: 1. ..." and
  // get cut off by maxTokens before ever producing JSON, no matter
  // how the prompt was worded. `format` fixes that at the decoding
  // level instead of the prompt level, so no future prompt wording
  // change can silently reopen the same failure mode.
  if (options.format) {
    body.format = options.format;
  }

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.done) {
    emitMetrics(data, options.model || process.env.OLLAMA_MODEL || 'qwen3:4b', options.requestId);
  }
  return data.message.content;
}

async function* streamComplete(messages, options = {}) {
  const startTime = Date.now();
  const log = (msg) => console.log(`[OllamaProvider Timing] ${Date.now() - startTime}ms - ${msg}`);
  
  log('Building payload...');
  const payload = JSON.stringify({
    model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
    messages,
    stream: true,
    think: options.think ?? false,
    keep_alive: options.keepAlive || Number(process.env.OLLAMA_KEEP_ALIVE) || 1800,
    options: {
      temperature: options.temperature ?? 0.7,
      num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
      ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
    }
  });

  const req = http.request({
    hostname: 'localhost',
    port: 11434,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  });

  const streamPromise = new Promise((resolve, reject) => {
    req.on('response', (res) => {
      log('HTTP response received from Ollama');
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', chunk => errData += chunk);
        res.on('end', () => reject(new Error(`Ollama stream request failed: ${res.statusCode} ${res.statusMessage} - ${errData}`)));
        return;
      }
      resolve(res);
    });

    req.on('error', (e) => reject(new Error(`Ollama stream request error: ${e.message}`)));
    req.write(payload);
    req.end();
    log('Request sent to Ollama');
  });

  const res = await streamPromise;
  const modelName = options.model || process.env.OLLAMA_MODEL || 'qwen3:4b';

  let buffer = '';
  let firstRawChunk = true;
  let firstParsed = true;
  let firstYield = true;

  for await (const chunk of res) {
    if (firstRawChunk) {
      log('First raw chunk received');
      firstRawChunk = false;
    }
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        if (firstParsed) {
          log('First JSON line parsed');
          firstParsed = false;
        }
        const data = JSON.parse(line);
        if (data.message) {
          // Yield thinking tokens AND content tokens
          if (data.message.thinking) {
            if (firstYield) {
              log('First THINKING chunk YIELDED to Atlas');
              firstYield = false;
            }
            yield { type: 'thinking', text: data.message.thinking };
          }
          if (data.message.content) {
            if (firstYield) {
              log('First CONTENT chunk YIELDED to Atlas');
              firstYield = false;
            }
            yield { type: 'content', text: data.message.content };
          }
        }
        if (data.done) {
          emitMetrics(data, modelName, options.requestId);
        }
      } catch (e) {
        console.error('[OllamaProvider] Failed to parse stream JSON:', e);
      }
    }
  }
  log('Stream ended');
}

function emitMetrics(data, model, requestId) {
  const ms = (ns) => Math.round(ns / 1000000);
  const metrics = {
    requestId,
    model,
    loadDuration: ms(data.load_duration || 0),
    promptEvalDuration: ms(data.prompt_eval_duration || 0),
    promptEvalCount: data.prompt_eval_count || 0,
    evalDuration: ms(data.eval_duration || 0),
    evalCount: data.eval_count || 0,
    totalDuration: ms(data.total_duration || 0)
  };
  eventBus.emit(EventTypes.LLM_METRICS, metrics);
}

async function warmup(modelName) {
  console.log(`[OllamaProvider] Warming up model: ${modelName}...`);
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName || process.env.OLLAMA_MODEL || 'qwen3:4b',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        think: false,
        keep_alive: Number(process.env.OLLAMA_KEEP_ALIVE) || 1800,
        options: { num_predict: 1 }
      }),
    });
    if (response.ok) {
      console.log(`[OllamaProvider] ✅ ${modelName} is warm and resident in VRAM.`);
    }
  } catch (e) {
    console.warn(`[OllamaProvider] Warmup failed. Is Ollama running?`);
  }
}

module.exports = { complete, streamComplete, warmup };