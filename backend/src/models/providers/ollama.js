// backend/src/models/providers/ollama.js
const http = require('http');
const { eventBus } = require('../../events/eventBus');
const EventTypes = require('../../events/eventTypes');

function buildRequestBody(messages, options = {}, stream = false) {
  const body = {
    model: options.model || process.env.OLLAMA_MODEL || 'qwen3:4b',
    messages,
    stream,
    think: options.think ?? false,
    keep_alive: options.keepAlive || Number(process.env.OLLAMA_KEEP_ALIVE) || 1800,
    options: {
      temperature: options.temperature ?? 0.7,
      num_ctx: options.context ?? (Number(process.env.OLLAMA_NUM_CTX) || 8192),
      ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
    }
  };
  if (options.format) body.format = options.format;
  return body;
}

async function complete(messages, options = {}) {
  const body = buildRequestBody(messages, options, false);

  // Optional structured formats remain available for internal extraction
  // tasks. Alice's user-facing response path intentionally does not use a
  // grammar; it uses native thinking plus content-channel filtering.
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
  const body = buildRequestBody(messages, options, true);
  const payload = JSON.stringify(body);

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
          // Surface completion state to the orchestration layer. A Qwen
          // generation that ends because num_predict was exhausted is not a
          // successful empty answer; conversationEngine can recover before
          // returning a user-facing failure.
          yield {
            type: 'done',
            doneReason: data.done_reason || null,
            evalCount: data.eval_count || 0
          };
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
    totalDuration: ms(data.total_duration || 0),
    doneReason: data.done_reason || null
  };
  // num_predict is a SHARED budget across thinking + content for this
  // model/Ollama combo (qwen3's reasoning-as-content behavior means there
  // is no separate reasoning allowance - see reasoning/controller.js).
  // done_reason: "length" means generation was cut off mid-stream, not
  // that it finished naturally - if that happens while the reply looked
  // empty or truncated to the user, the fix is raising maxTokens for the
  // policy that produced this request, not chasing the think flag again.
  if (data.done_reason === 'length') {
    console.warn(`[OllamaProvider] ${requestId}: hit maxTokens (num_predict) before the model finished - reply was likely truncated. evalCount=${data.eval_count || 0}`);
  }
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

module.exports = { complete, streamComplete, warmup, buildRequestBody };
