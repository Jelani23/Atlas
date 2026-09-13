// modelRouter.js

const GENERAL_MODEL = process.env.OLLAMA_MODEL_GENERAL || process.env.OLLAMA_MODEL || 'qwen3.5:4b';
const CODER_MODEL = process.env.OLLAMA_MODEL_CODER || 'qwen2.5-coder:7b';

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

// Search synthesis stays on the configured local general model. Remote
// free-tier providers previously made search availability and latency
// depend on external quotas; no automatic route should require them.
const SEARCH_DECISION = {
  ...GENERAL_DECISION,
  reason: 'web search synthesis routed to the local general model',
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
