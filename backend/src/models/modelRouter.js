// modelRouter.js

const GENERAL_MODEL = process.env.OLLAMA_MODEL_GENERAL || 'qwen3:4b';
const CODER_MODEL = process.env.OLLAMA_MODEL_CODER || 'qwen2.5-coder:7b';
// gemini-2.5-flash started 404ing ("no longer available") ahead of its
// official shutdown date - see gemini.js's provider-level comment.
// gemini-3.6-flash is the current stable GA replacement; keep this in
// sync with the defaults in gemini.js and preprocessingConfig.js.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const GENERAL_DECISION = {
  provider: 'ollama',
  model: GENERAL_MODEL,
  supportsThinking: true,
  keepAlive: process.env.OLLAMA_KEEPALIVE_GENERAL || '30m',
  reason: 'general-purpose model (default)',
};

const CODER_DECISION = {
  provider: 'ollama',
  model: CODER_MODEL,
  supportsThinking: false,
  // Pulled in on demand rather than kept warm by default
  keepAlive: process.env.OLLAMA_KEEPALIVE_CODER || undefined,
  reason: 'tool is a code/file semantic task - routed to coding specialist',
};

// Web search synthesis goes to Gemini 2.5 Flash instead of Qwen3: the
// search request already gathered raw source material, and Gemini Flash
// synthesizes it into the final answer much faster than Qwen3's long
// thinking trace over the (potentially large) search + memory context.
// Falls back to Qwen3 automatically when GEMINI_API_KEY is missing
// (conversationEngine guards that).
const SEARCH_DECISION = {
  provider: 'gemini',
  model: GEMINI_MODEL,
  supportsThinking: false,
  reason: 'web search synthesis routed to Gemini 2.5 Flash for fast responses',
};

const CODE_SEMANTIC_TASKS = new Set([
  'analyze_and_suggest',
  'analyze_and_save',
  'propose_code_change',
  'generate_code',
  'create_note',
  'append_note',
]);

/**
 * @param {string} [taskName] - toolResult.toolName from planner.route(),
 *   i.e. the specific planner task that fired (e.g. 'analyze_and_suggest').
 *   Pass undefined/null when no tool fired (plain conversation).
 * @returns {{provider: string, model: string, supportsThinking: boolean, keepAlive: string|undefined, reason: string}}
 */
function getModelForTask(taskName) {
  if (taskName && CODE_SEMANTIC_TASKS.has(taskName)) {
    return { ...CODER_DECISION };
  }
  if (taskName === 'search_web' || taskName === 'webSearch') {
    return { ...SEARCH_DECISION };
  }
  return { ...GENERAL_DECISION };
}

/** Always the general model - for call sites that run before any task is known (e.g. the normalizer itself). */
function getDefaultModel() {
  return { ...GENERAL_DECISION };
}

module.exports = { getModelForTask, getDefaultModel, CODE_SEMANTIC_TASKS };