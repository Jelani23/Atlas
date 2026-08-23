// preprocessing/preprocessingLayer.js
//
// Optional pre-contextualization / preprocessing layer sitting between
// Atlas's existing deterministic/router processing and final context
// assembly:
//
//   User input
//     -> Deterministic layer (existing, first priority)
//     -> Existing router (intentResolver / planner)
//     -> Determine Processing Needs (this file)
//     -> [Groq semantic preprocessing]      (optional)
//     -> context retrieval (existing)
//     -> [Gemini contextual preprocessing]  (optional, over retrieved context)
//     -> Context Builder -> Qwen / Qwen Coder (unchanged)
//
// The pipeline is CONDITIONAL, not "Groq -> Gemini -> Qwen" every time:
//   - simple / deterministic request    -> no preprocessing
//   - ambiguous natural-language        -> Groq only
//   - context-heavy request             -> retrieval + Gemini only
//   - complex + ambiguous + context-heavy -> Groq + retrieval + Gemini
//
// Groq answers "what does the user appear to mean?" and, when it runs, its
// profile is authoritative for whether the context-heavy Gemini stage is
// needed (contextRequired / memoryRelevant). This is the future home of the
// semantic router.
//
// Design rules honored here:
//   - Both providers stay behind the existing modelAdapter abstraction.
//   - Nothing is mandatory: missing keys, API errors, timeouts, malformed
//     responses, and rate limits all fall back to the existing pipeline.
//   - Gemini only ever processes context the existing retrieval system
//     already pulled in; it never replaces retrieval.
//   - This function NEVER throws. Callers can treat it as free.
//
// Observability: every decision/skip/success path is logged so it is
// possible to tell (a) whether a stage ran and (b) why it did not.

const semanticAnalyzer = require('./semanticAnalyzer');
const contextualProcessor = require('./contextualProcessor');
const contextManager = require('../core/contextManager');
const { config, isGroqAvailable, isGeminiAvailable } = require('./preprocessingConfig');

// Deterministic tools that feed a lot of retrieved content into the LLM for
// synthesis. Today the only DETERMINISTIC tool that reaches this layer is
// web search (planner.js short-circuits every other deterministic tool
// before the layer) - the resolver's winner is 'webSearch', but planner
// hands it off as toolName 'search_web', so both names are listed.
const CONTEXT_HEAVY_TOOLS = new Set([
  'webSearch',
  'search_web',
]);

const CONTEXT_SECTIONS = ['state', 'personal', 'projects', 'knowledge', 'procedures', 'features'];

/**
 * Conservative skip gate: requests the deterministic path already fully
 * answered must never spend a Groq/Gemini request on them.
 */
function shouldSkip({ toolResult } = {}) {
  return !!(toolResult && toolResult.shortCircuit);
}

/**
 * "Determine Processing Needs" - decides whether additional processing is
 * useful for THIS request, based only on routing signals (never the LLM).
 *
 * @param {Object} opts
 * @param {Object} [opts.intent] - output of intentResolver.resolve()
 * @param {Object} [opts.toolResult] - output of planner.route()
 * @returns {{ runSemantic: boolean, runContextual: boolean }}
 */
function determineProcessingNeeds({ intent = {}, toolResult } = {}) {
  if (shouldSkip({ toolResult })) {
    return { runSemantic: false, runContextual: false };
  }

  const state = intent.state || 'UNKNOWN';
  const llmRequired = intent.llmRequired === true;
  const toolName = (toolResult && toolResult.toolName) || intent.winner || null;

  // Groq (semantic): only when the router cannot confidently understand the
  // language. If the intent was clearly identified (DETERMINISTIC), the
  // request is already clear and we don't spend a Groq request on it.
  const runSemantic = llmRequired || state === 'AMBIGUOUS' || state === 'UNKNOWN';

  // Gemini (contextual): only for context-heavy requests - either the router
  // has no idea (UNKNOWN / llmRequired), or the matched tool itself feeds a
  // lot of retrieved content into the LLM. A plain AMBIGUOUS request alone is
  // Groq-only per the pipeline decision tree.
  const runContextual =
    llmRequired ||
    state === 'UNKNOWN' ||
    (toolName !== null && CONTEXT_HEAVY_TOOLS.has(toolName));

  return { runSemantic, runContextual };
}

function countEntries(relevantMemory) {
  if (!relevantMemory) return 0;
  let total = 0;
  for (const section of CONTEXT_SECTIONS) {
    if (Array.isArray(relevantMemory[section])) {
      total += relevantMemory[section].length;
    }
  }
  return total;
}

/**
 * Steps 1-2 only: "Determine Processing Needs" + Groq semantic preprocessing.
 * Split out from runPreprocessing() so callers that need Groq's read on the
 * request EARLY - before tool-independent decisions like reasoning depth
 * and response shape are locked in (see reasoningController.js /
 * responseController.js) - can run just this half without waiting on
 * context retrieval or Gemini. runPreprocessing() below calls this
 * internally when no precomputed stage is supplied via overrides, so
 * behavior for existing callers is unchanged.
 *
 * @param {Object} opts
 * @param {string} opts.userInput
 * @param {Object} opts.intent - output of intentResolver.resolve()
 * @param {Array}  [opts.history]
 * @param {Object} [opts.toolResult] - output of planner.route()
 * @param {Object} [opts.overrides] - { groqAdapter } injected adapter (tests only)
 * @returns {Promise<{ran: boolean, semantic: Object|null, runContextual: boolean}>} never throws
 */
async function runSemanticStage({ userInput, intent, history = [], toolResult, overrides = {} } = {}) {
  if (!config.enabled || shouldSkip({ toolResult })) {
    return { ran: false, semantic: null, runContextual: false };
  }

  const decision = determineProcessingNeeds({ intent, toolResult });
  let runContextual = decision.runContextual;
  let ran = false;
  let semantic = null;

  if (decision.runSemantic) {
    if (isGroqAvailable()) {
      try {
        semantic = await semanticAnalyzer.analyzeSemantics({
          userInput,
          history,
          adapter: overrides.groqAdapter,
        });
        if (semantic) {
          ran = true;
          console.log(
            `[Preprocessing] Groq semantic: task=${semantic.taskType || '?'} ` +
            `communication=${semantic.communicationType || '?'} ` +
            `ambiguous=${semantic.ambiguous === true} contextRequired=${semantic.contextRequired === true} ` +
            `memoryRelevant=${semantic.memoryRelevant === true} needsTools=${semantic.needsTools === true} ` +
            `reasoningRequired=${semantic.reasoningRequired || '?'}`
          );
          // Groq's profile is authoritative when present: it decides whether
          // the request is context-heavy enough for the Gemini stage.
          runContextual = semantic.contextRequired === true || semantic.memoryRelevant === true;
        } else {
          console.warn('[Preprocessing] Groq semantic produced no usable profile; using heuristic contextual decision');
        }
      } catch (err) {
        console.warn('[Preprocessing] Groq semantic stage failed; falling back:', err.message);
      }
    } else {
      console.log('[Preprocessing] Groq semantic skipped: GROQ_SEMANTIC_PREPROCESSING not enabled or GROQ_API_KEY missing');
    }
  }

  return { ran, semantic, runContextual, decisionRunContextual: decision.runContextual };
}

/**
 * @param {Object} opts
 * @param {string} opts.userInput
 * @param {Object} opts.intent - output of intentResolver.resolve()
 * @param {Array}  opts.history
 * @param {Object} opts.toolResult - output of planner.route()
 * @param {Object} [opts.workingContext] - rolling working context (unused today, kept for the future router)
 * @param {Object} [opts.overrides] - { groqAdapter, geminiAdapter, getRelevantContext, semanticStage }
 *   injected adapters/retrieval (tests only), plus an optional precomputed
 *   `semanticStage` (the return value of runSemanticStage()) to avoid
 *   calling Groq a second time when a caller already ran it early.
 * @returns {Promise<Object>} never throws
 */
async function runPreprocessing({ userInput, intent, history = [], toolResult, workingContext, overrides = {} } = {}) {
  const result = {
    ran: false,
    semantic: null,
    contextual: null,
    relevantMemory: null,
    contextualNotes: null,
    condensedToolResult: null,
  };

  if (!config.enabled) return result;

  if (shouldSkip({ toolResult })) {
    console.log('[Preprocessing] Skipped: shortCircuit tool result');
    return result;
  }

  const decision = determineProcessingNeeds({ intent, toolResult });
  if (!decision.runSemantic && !decision.runContextual && !overrides.semanticStage) {
    console.log('[Preprocessing] Skipped: no preprocessing needed (request already answered deterministically or clearly identified)');
    return result;
  }

  let runContextual;
  if (overrides.semanticStage) {
    // Groq already ran for this turn (see conversationEngine.js) - reuse it
    // instead of spending a second Groq request.
    const stage = overrides.semanticStage;
    result.ran = stage.ran;
    result.semantic = stage.semantic;
    runContextual = stage.runContextual;
  } else {
    const stage = await runSemanticStage({ userInput, intent, history, toolResult, overrides });
    result.ran = stage.ran;
    result.semantic = stage.semantic;
    runContextual = stage.runContextual;
  }

  // --- 3. Gemini: contextual preprocessing (over already-retrieved context) ---
  if (runContextual) {
    if (isGeminiAvailable()) {
      try {
        // Retrieve through the existing retrieval flow so Gemini only ever
        // sees what the normal pipeline would have pulled in. `overrides`
        // lets tests inject a fake retrieval without a database.
        const getRelevantContext = overrides.getRelevantContext || contextManager.getRelevantContext;
        const relevantMemory = await getRelevantContext(userInput, history, intent);
        result.relevantMemory = relevantMemory;

        if (!contextualProcessor.isWorthProcessing(relevantMemory)) {
          console.log('[Preprocessing] Gemini contextual skipped: retrieval returned no context to filter');
        } else {
          const contextual = await contextualProcessor.processContext({
            userInput,
            relevantMemory,
            adapter: overrides.geminiAdapter,
          });
          if (contextual) {
            result.ran = true;
            result.contextual = contextual;
            result.contextualNotes = contextualProcessor.buildNotes(contextual);
            const before = countEntries(relevantMemory);
            const filtered = contextualProcessor.applyFiltering(relevantMemory, contextual);
            const after = countEntries(filtered);
            result.relevantMemory = filtered;
            console.log(
              `[Preprocessing] Gemini contextual: ${before} retrieved entries -> ${after} after filtering` +
              (contextual.summary ? ` | ${contextual.summary}` : '')
            );
          } else {
            console.warn('[Preprocessing] Gemini contextual produced no usable profile; using unprocessed retrieval');
          }
        }

        // Phase: condense the raw tool result itself (e.g. searchPipeline's
        // aggregated multi-query material) too, not just the structured
        // memory retrieval above. See contextualProcessor.condenseToolResult's
        // comment - this is the piece that was missing for web search
        // specifically, which is the single biggest context-bloat source
        // in the pipeline today.
        const rawToolResult = toolResult && toolResult.needsTool ? toolResult.toolResult : null;
        if (typeof rawToolResult === 'string' && rawToolResult.length > 0) {
          const condensed = await contextualProcessor.condenseToolResult({
            userInput,
            rawResult: rawToolResult,
            adapter: overrides.geminiAdapter,
          });
          if (condensed) {
            result.ran = true;
            result.condensedToolResult = condensed;
            console.log(
              `[Preprocessing] Gemini tool-result condensing: ${rawToolResult.length} chars -> ${condensed.length} chars`
            );
          }
        }
      } catch (err) {
        console.warn('[Preprocessing] Gemini contextual stage failed; using unprocessed retrieval:', err.message);
      }
    } else {
      console.log('[Preprocessing] Gemini contextual skipped: GEMINI_CONTEXT_PREPROCESSING not enabled or GEMINI_API_KEY missing');
    }
  } else {
    console.log('[Preprocessing] Gemini contextual skipped: request not context-heavy (per Groq profile or routing heuristic)');
  }

  return result;
}

module.exports = { runPreprocessing, runSemanticStage, determineProcessingNeeds, shouldSkip };
