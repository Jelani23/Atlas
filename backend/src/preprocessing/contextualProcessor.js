// preprocessing/contextualProcessor.js
//
// Gemini 2.5 Flash as Atlas's context-heavy preprocessing model.
//
// This stage operates on ALREADY-RETRIEVED context (the output of
// contextManager.getRelevantContext) - it does not replace the existing
// retrieval system. Its job is to filter/synthesize that retrieved context
// (drop redundant or irrelevant entries, surface a synthesis note) before
// the main Qwen model sees it.
//
// Like the semantic stage this is infrastructure only: it produces the
// keep/drop/notes structure, and the filtering applied here is deliberately
// conservative and reversible. The decision logic for when to run it (and
// how aggressively to filter) lives in the future semantic/context router.
//
// Every failure mode resolves to `null` / an unchanged context so the
// existing pipeline continues unaffected.

const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const { config } = require('./preprocessingConfig');

let cachedAdapter;
function getAdapter() {
  if (!cachedAdapter) cachedAdapter = createModelAdapter('gemini');
  return cachedAdapter;
}

const SECTIONS = [
  ['state', 'Active user state'],
  ['personal', 'User profile'],
  ['projects', 'Project memory'],
  ['knowledge', 'Knowledge library'],
  ['procedures', 'Procedural heuristics'],
  ['features', 'Dev state'],
];

function serializeRelevantMemory(relevantMemory) {
  const lines = [];
  for (const [name, label] of SECTIONS) {
    const list = (relevantMemory && relevantMemory[name]) || [];
    if (list.length === 0) continue;
    lines.push(`${label} (${name}):`);
    list.forEach((item, i) => {
      const parts = [
        item.key,
        item.value,
        item.subject,
        item.category,
        item.trigger,
        item.action,
        item.feature,
        item.status,
        Array.isArray(item.topics) ? item.topics.join(', ') : '',
      ];
      lines.push(`[${i}] ${parts.filter(Boolean).join(' | ')}`);
    });
  }
  return lines.join('\n');
}

const CONTEXTUAL_PROMPT = `You are a context-filtering preprocessor in a personal AI assistant's pipeline.
The user's request is given, followed by the context the retrieval system pulled in for it.
Reduce unnecessary context before the main model sees it:
- DROP entries that are clearly irrelevant or redundant for this request.
- KEEP everything that could help answer it.
Return ONLY a flat JSON object:
{
  "summary": "one-sentence synthesis of what the context tells us about this request",
  "keep": [list of [N] indices to keep - empty means keep all],
  "drop": [list of [N] indices to drop - empty means drop none],
  "notes": "one or two brief sentences for the main model, or an empty string"
}
Use the [N] indices exactly as labeled. If nothing should change, return empty keep and drop arrays.`;

function isWorthProcessing(relevantMemory) {
  if (!relevantMemory) return false;
  let total = 0;
  for (const [name] of SECTIONS) {
    const list = relevantMemory[name] || [];
    total += list.length;
  }
  return total > 0;
}

/**
 * Runs Gemini contextual preprocessing over already-retrieved context.
 *
 * @param {Object} opts
 * @param {string} opts.userInput - the user's message
 * @param {Object} opts.relevantMemory - output of contextManager.getRelevantContext
 * @param {Object} [opts.adapter] - injected provider adapter (tests only)
 * @returns {Promise<Object|null>} { summary, keep, drop, notes } or null on failure
 */
async function processContext({ userInput, relevantMemory, adapter } = {}) {
  const serialized = serializeRelevantMemory(relevantMemory);
  if (!serialized) return null;

  const modelAdapter = adapter || getAdapter();
  const prompt = `${CONTEXTUAL_PROMPT}\n\nUser request: "${userInput}"\n\nRetrieved context:\n${serialized}`;

  try {
    const response = await modelAdapter.complete(
      [
        { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        model: config.gemini.model,
        temperature: 0.1,
        // Phase: bumped from 600. gemini-3.6-flash can't drop thinking
        // below reasoning_effort:'low' (see gemini.js), which reserves a
        // nonzero token floor before the visible JSON - 600 left no room
        // for that floor plus the actual keep/drop response, so this was
        // silently returning empty completions the same way the old
        // uncapped-thinking bug did.
        maxTokens: 1400,
        timeout: config.gemini.timeoutMs,
      }
    );

    const parsed = extractJSON(response);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[ContextualProcessor] Malformed response:', safePreview(response));
      return null;
    }
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : null,
      keep: Array.isArray(parsed.keep) ? parsed.keep : [],
      drop: Array.isArray(parsed.drop) ? parsed.drop : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : null,
    };
  } catch (err) {
    console.warn('[ContextualProcessor] Gemini contextual preprocessing failed:', err.message);
    return null;
  }
}

function toIndices(value) {
  return value
    .map((v) => (typeof v === 'number' ? v : parseInt(v, 10)))
    .filter((v) => Number.isInteger(v) && v >= 0);
}

/**
 * Conservatively applies Gemini's keep/drop decision to a copy of the
 * retrieved context. If the decision is empty, malformed, or would empty
 * a section entirely, the section is left unchanged.
 */
function applyFiltering(relevantMemory, contextual) {
  if (!relevantMemory || !contextual) return relevantMemory;

  const keep = toIndices(contextual.keep);
  const drop = toIndices(contextual.drop);

  const filtered = { ...relevantMemory };
  for (const [name] of SECTIONS) {
    const list = relevantMemory[name];
    if (!Array.isArray(list) || list.length === 0) continue;

    let kept;
    if (keep.length > 0) {
      kept = list.filter((_, i) => keep.includes(i));
    } else if (drop.length > 0) {
      kept = list.filter((_, i) => !drop.includes(i));
    } else {
      continue;
    }

    // Never fully empty a section on a low-confidence model decision;
    // keep at least one entry so the main model still sees the category.
    if (kept.length === 0 && list.length > 0) {
      kept = list;
    }
    filtered[name] = kept;
  }
  return filtered;
}

function buildNotes(contextual) {
  if (!contextual) return null;
  const parts = [];
  if (contextual.summary) parts.push(`Summary: ${contextual.summary}`);
  if (contextual.notes) parts.push(contextual.notes);
  return parts.length > 0 ? parts.join('\n') : null;
}

// Phase: this stage previously only ever touched `relevantMemory` (the
// structured memory/knowledge/procedure retrieval). CONTEXT_HEAVY_TOOLS
// in preprocessingLayer.js is described as covering "deterministic tools
// that feed a lot of retrieved content into the LLM for synthesis" - in
// practice today that's web search - but the raw aggregated search
// material (searchPipeline.js's 3-query concatenation, easily several KB)
// was never actually passed through Gemini at all; it went straight into
// the final prompt unfiltered regardless of whether this preprocessing
// layer ran. That's the opposite of what the architecture doc describes
// Gemini doing for search specifically. This condenses that raw material
// the same way processContext() condenses structured memory: read
// everything, keep every distinct fact, cut duplication/filler/boilerplate
// across the multiple query results.
const CONDENSE_PROMPT = `You are a research-condensing preprocessor in a personal AI assistant's pipeline.
Below is raw material gathered from several related web searches for the user's request - it likely contains
duplication across sources and irrelevant boilerplate (navigation text, ads, unrelated sections).
Condense it for a downstream model that will write the final answer:
- Keep every distinct fact, figure, date, and claim relevant to the request - do not drop substance.
- Remove duplication across sources (the same fact repeated in multiple results only needs to appear once).
- Remove boilerplate, navigation text, and anything clearly irrelevant to the request.
- Do NOT answer the request yourself - only condense the source material for the model that will.
Output the condensed material as plain text (not JSON), organized however makes it easiest to read.`;

/**
 * Condenses raw tool output (currently: aggregated web search material)
 * before it reaches the final context. Unlike processContext(), this
 * works over unstructured text rather than the structured relevantMemory
 * shape, since a tool result (search transcript, file contents, etc.) has
 * no discrete indexable entries to keep/drop.
 *
 * @param {Object} opts
 * @param {string} opts.userInput
 * @param {string} opts.rawResult - toolResult.toolResult
 * @param {Object} [opts.adapter] - injected provider adapter (tests only)
 * @returns {Promise<string|null>} condensed text, or null on failure/skip
 *   (caller should fall back to the raw result unchanged)
 */
async function condenseToolResult({ userInput, rawResult, adapter } = {}) {
  if (!rawResult || typeof rawResult !== 'string' || rawResult.trim().length === 0) {
    return null;
  }

  const modelAdapter = adapter || getAdapter();
  const prompt = `${CONDENSE_PROMPT}\n\nUser request: "${userInput}"\n\nRaw material:\n${rawResult}`;

  try {
    const response = await modelAdapter.complete(
      [
        { role: 'system', content: 'You are a research-condensing assistant. Output only the condensed material, no preamble.' },
        { role: 'user', content: prompt },
      ],
      {
        model: config.gemini.model,
        temperature: 0.1,
        // Phase: bumped from 1500 for the same reasoning_effort:'low'
        // token-floor reason as the call above - condensing needs room to
        // preserve substance on top of that floor, not just match it.
        maxTokens: 2500,
        timeout: config.gemini.timeoutMs,
      }
    );

    const condensed = typeof response === 'string' ? response.trim() : '';
    if (!condensed) {
      console.warn('[ContextualProcessor] Tool-result condensing returned empty output; using raw result');
      return null;
    }
    // A condensation that came back longer than the input didn't actually
    // condense anything useful - not worth the extra Gemini round trip
    // over just using the raw material.
    if (condensed.length >= rawResult.length) {
      console.warn('[ContextualProcessor] Tool-result condensing did not shrink the content; using raw result');
      return null;
    }
    return condensed;
  } catch (err) {
    console.warn('[ContextualProcessor] Tool-result condensing failed; using raw result:', err.message);
    return null;
  }
}

module.exports = {
  isWorthProcessing,
  processContext,
  applyFiltering,
  buildNotes,
  condenseToolResult,
};