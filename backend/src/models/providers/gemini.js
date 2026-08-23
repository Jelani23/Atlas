const OpenAI = require('openai');

// Gemini 2.5 Flash exposes an OpenAI-compatible chat completions endpoint
// under the Generative Language API, so this provider is structurally
// identical to providers/openai.js - only the base URL and default model
// differ.
//
// Constructed lazily so requiring this file never fails just because
// GEMINI_API_KEY isn't set yet (useful for tests, syntax checks, etc.).
let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }
  return client;
}

// Phase (404 fix, Aug 23): gemini-2.5-flash started returning a bare 404
// "no longer available" from Google well ahead of its official Oct 16
// 2026 shutdown date (matches the live error seen here exactly - a 404
// with no error body, on every call including streamComplete). This is a
// known Google-side issue (their forums have multiple reports from July
// 2026 on), not something fixable from this codebase - the model ID
// itself stopped resolving. gemini-3.6-flash is the current stable GA
// replacement.
//
// That model switch has a second consequence: Gemini 3.x does NOT support
// fully disabling thinking the way 2.5 did - `reasoning_effort: "none"`
// (the previous fix here) is only valid for 2.5 models and would itself
// 400 on 3.6. "low" is the actual minimum for 3.x (and still meaningfully
// reduces thinking-token spend on 2.5, if GEMINI_MODEL ever gets pointed
// back at a 2.5-series model). See the maxTokens bump at each call site
// (contextualProcessor.js, searchPipeline.js) - "low" still reserves a
// nonzero thinking floor, so budgets sized only for the visible reply
// (as they were before the original thinking-budget bug fix) will still
// come back empty.
async function complete(messages, options = {}) {
  // `timeout` is an SDK-level request option, NOT part of the chat
  // completions body - sending it in the body makes the API reject the
  // request with a 400 error.
  const { timeout, ...body } = options;
  const response = await getClient().chat.completions.create(
    {
      model: body.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      messages,
      temperature: body.temperature ?? 0.2,
      reasoning_effort: 'low',
      ...(body.maxTokens !== undefined ? { max_tokens: body.maxTokens } : {}),
    },
    timeout !== undefined ? { timeout } : undefined
  );
  return response.choices[0].message.content;
}

/**
 * Streaming variant of `complete`. Gemini 3.6 Flash cannot fully disable
 * thinking (see reasoning_effort note above) - `reasoning_effort: 'low'`
 * minimizes it but a nonzero thinking pass can still precede the visible
 * reply. Every delta is yielded as a `content` chunk (shape matches the
 * ollama provider's stream) - used to power fast, incremental UI/TTS
 * output.
 */
async function* streamComplete(messages, options = {}) {
  const { timeout, ...body } = options;
  const stream = await getClient().chat.completions.create(
    {
      model: body.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      messages,
      temperature: body.temperature ?? 0.2,
      reasoning_effort: 'low',
      ...(body.maxTokens !== undefined ? { max_tokens: body.maxTokens } : {}),
      stream: true,
    },
    timeout !== undefined ? { timeout } : undefined
  );

  for await (const chunk of stream) {
    const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
      yield { type: 'content', text: delta.content };
    }
  }
}

module.exports = { complete, streamComplete };