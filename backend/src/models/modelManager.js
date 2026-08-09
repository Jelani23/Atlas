// modelManager.js
//
// Owns residency, not selection. modelRouter decides WHICH model a request
// needs; this file is the only place that asks "is that model already
// sitting in VRAM, and how long should it stay there."
//
// Deliberately thin: Ollama already does the actual load/unload work and
// exposes what's currently resident via GET /api/ps, so there's no reason
// to reimplement a model cache here - just read Ollama's own state and
// expose a warm-up helper for startup.

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

/**
 * Returns the models Ollama currently has loaded in memory, per /api/ps.
 * Best-effort: if Ollama is unreachable or this is an older Ollama version
 * without /api/ps, returns an empty array rather than throwing - residency
 * info is an optimization, not something a request should ever fail on.
 */
async function getLoadedModels() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/ps`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch (err) {
    console.error('[modelManager] Could not reach /api/ps:', err.message);
    return [];
  }
}

async function isLoaded(modelName) {
  const loaded = await getLoadedModels();
  return loaded.includes(modelName);
}

/**
 * Pings a model with a trivial request so it's resident before the first
 * real user turn hits it (mainly for the general model at Atlas startup -
 * you don't want the first message of the session eating a cold-load).
 */
async function warmModel(model, keepAlive) {
  try {
    await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
      }),
    });
    console.log(`[modelManager] Warmed ${model}`);
  } catch (err) {
    // Non-fatal - worst case the first real request just eats the cold-load
    // this was trying to avoid.
    console.error(`[modelManager] Failed to warm ${model}:`, err.message);
  }
}

module.exports = { getLoadedModels, isLoaded, warmModel };