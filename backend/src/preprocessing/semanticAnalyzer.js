// preprocessing/semanticAnalyzer.js
//
// Groq (llama-3.1-8b-instant) as Atlas's fast semantic preprocessing model.
//
// This establishes the INFRASTRUCTURE ONLY. It can produce a lightweight
// structured profile of the incoming request (task type, communication
// type, ambiguity, whether context/memory may be needed, ...) but nothing
// here yet makes routing decisions from it - that decision logic belongs
// to the future semantic router and intentionally lives outside this pass.
//
// Every failure mode (missing key, API error, timeout, rate limit,
// malformed response) resolves to `null` so the caller can fall back to
// the existing deterministic/Qwen pipeline without interruption.

const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const { config } = require('./preprocessingConfig');

let cachedAdapter;
function getAdapter() {
  if (!cachedAdapter) cachedAdapter = createModelAdapter('groq');
  return cachedAdapter;
}

const SEMANTIC_PROMPT = `You are a lightweight semantic preprocessing step in a personal AI assistant's pipeline.
Classify the following user message and return ONLY a flat JSON object with these fields:
{
  "taskType": "conversation" or "coding" or "search" or "memory" or "planning" or "action" or "capability",
    ("capability" is for questions about what the assistant itself can do or
    access - e.g. "can you read your own code?", "do you have file access?" -
    as opposed to "search", which is about looking up external information.)
  "communicationType": "statement" or "question" or "command" or "clarification",
  "ambiguous": true or false,
  "contextRequired": true or false,
  "memoryRelevant": true or false,
  "needsTools": true or false,
  "reasoningRequired": "low" or "medium" or "high" - how much genuine multi-step
    reasoning the response itself needs, independent of whether the message
    is ambiguous to classify. "low" for small talk, simple factual questions,
    or a short confirmation. "high" for something that needs working through
    (debugging, planning, multi-part comparisons, non-trivial explanations).
  "topicFamiliarity": "confident" or "uncertain" or "not_applicable" - ONLY
    relevant when the message asks about a specific real-world fact, named
    entity, person, product, event, or piece of media (e.g. "what is X",
    "who is Y", "tell me about Z"). Answer as YOURSELF, a large well-informed
    model - not a guess about what a smaller downstream model might do:
    "confident" if you have specific, verifiable, well-established knowledge
    of that exact entity/topic. "uncertain" if the entity is obscure, you're
    not sure you have accurate specific details (names, dates, roles,
    relationships), it could be confused with something similarly named, or
    you genuinely don't recognize it. Use "not_applicable" for anything that
    isn't a specific factual/entity lookup (small talk, opinions, coding,
    instructions, math, etc). When uncertain whether you're uncertain,
    prefer "uncertain" - a false "confident" here causes a downstream model
    to fabricate authoritative-sounding details about something it doesn't
    actually know.
}
Base each field strictly on what the message actually asks for. Do not add fields, prose, or explanation.`;

/**
 * Runs Groq semantic preprocessing on the raw user input.
 *
 * @param {Object} opts
 * @param {string} opts.userInput - the user's message
 * @param {Array}  [opts.history] - recent conversation history (optional)
 * @param {Object} [opts.adapter] - injected provider adapter (tests only)
 * @returns {Promise<Object|null>} structured semantic profile, or null on any failure
 */
async function analyzeSemantics({ userInput, history = [], adapter } = {}) {
  const modelAdapter = adapter || getAdapter();
  const historyText = history
    .slice(-3)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `${SEMANTIC_PROMPT}\n\nRecent conversation:\n${historyText || 'None'}\n\nUser message: "${userInput}"`;

  try {
    const response = await modelAdapter.complete(
      [
        { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        model: config.groq.model,
        temperature: 0.1,
        maxTokens: 300,
        timeout: config.groq.timeoutMs,
      }
    );

    const parsed = extractJSON(response);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[SemanticAnalyzer] Malformed response:', safePreview(response));
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('[SemanticAnalyzer] Groq semantic preprocessing failed:', err.message);
    return null;
  }
}

module.exports = { analyzeSemantics };