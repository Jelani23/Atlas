// backend/src/core/contextBuilder.js
const { atlasState } = require('./atlasState');
const personalityEngine = require('./personalityEngine');
const worldModel = require('../memory/worldModel');
const contextManager = require('./contextManager');

// Phase (context-assembly refinement, F1): contextManager.js already
// scores/budgets each memory category per-intent (e.g. `project: 0` for a
// `search` intent), but nothing downstream acted on a zero/empty
// allocation - every section still printed unconditionally with "None" as
// filler. That's the actual gap between "retrieval is targeted" and "the
// final prompt is targeted" - this closes it at assembly time without
// touching retrieval/scoring at all.
function section(title, body) {
    if (!body || body === 'None' || body.trim() === '') return '';
    return `${title}\n${body}\n`;
}

// Fast-path only (see isWorldRelevant below) - fires when Groq semantic
// preprocessing didn't run or isn't configured. This is intentionally a
// short, obvious-cases-only list, not the thing doing the real work of
// recognizing capability questions; that's intent.intent === 'capability'
// (via Groq's taskType, promoted by intentCategory.js). Do not grow this
// list to chase edge cases - route them through the semantic classifier
// instead.
const CAPABILITY_FAST_PATH_PHRASES = [
    'what can you do', 'your capabilities', 'can you read your own code',
    'do you have file access', 'what tools do you have'
];

function deterministicCapabilityMatch(userInput) {
    const lower = (userInput || '').toLowerCase();
    return CAPABILITY_FAST_PATH_PHRASES.some(p => lower.includes(p));
}

async function buildContext({ mode, intent, responseStyle, memoryResult, toolResult, userInput, history, policy, workingContext, preprocessed }) {
    console.time("buildContext");
    
    // Phase: when the optional preprocessing layer already retrieved (and
    // possibly Gemini-filtered) the relevant context, reuse it instead of
    // running the retrieval flow a second time. When `preprocessed` is
    // absent or has no relevantMemory, behavior is identical to before.
    const relevantMemory = (preprocessed && preprocessed.relevantMemory)
        ? preprocessed.relevantMemory
        : await contextManager.getRelevantContext(userInput, history, intent);
    const world = await worldModel.getAll();

    // Phase (F2): the underlying model's training cutoff/year must never
    // determine Alice's perceived current date - see plan §9. This is a
    // single deterministic line (not the full getTime.js timezone dump,
    // which stays reserved for when the user actually asks for the time),
    // always present, computed with no tool call and no LLM involved.
    const runtimeDate = new Date();
    const dateLine = `Current date: ${runtimeDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (this is authoritative runtime information - never use training data to guess the current date or year).`;

    // Phase 3C.2: Rolling Conversation Working Context
    let workingContextStr = "None";
    if (workingContext && Object.keys(workingContext).length > 0) {
        workingContextStr = Object.entries(workingContext).map(([k, v]) => {
            if (Array.isArray(v)) return `- ${k}: ${v.join(', ')}`;
            return `- ${k}: ${v}`;
        }).join('\n');
    }

    let hotStateContext = "";
    const hot = relevantMemory.hotState;
    if (hot.activeProject || hot.activeFiles.length > 0 || hot.currentTask) {
        hotStateContext = `
--- ATLAS OS HOT CONTEXT (Current Working State) ---
Active Project: ${hot.activeProject || 'None'}
Active Files: ${hot.activeFiles.length > 0 ? hot.activeFiles.join(', ') : 'None'}
Current Task: ${hot.currentTask || 'None'}
--- END HOT CONTEXT ---
`;
    }

    // Phase 3C.1: User Profile (Stable facts only)
    let personalMemoryContext = "None";
    if (relevantMemory.personal && relevantMemory.personal.length > 0) {
        personalMemoryContext = relevantMemory.personal.map(item => `- ${item.key}: ${item.value}`).join('\n');
    }

    // Phase 3C.1: Active User State (Pointers)
    let userStateContext = "None";
    if (relevantMemory.state && relevantMemory.state.length > 0) {
        userStateContext = relevantMemory.state.map(item => `- ${item.key}: ${item.value}`).join('\n');
    }

    // Determine the active project. contextManager.js already
    // resolves this correctly (activeProjectKey) and also hands back
    // a project_key -> display-name map (projectNames) - use those
    // directly instead of re-deriving anything here.
    const activeProjectKey = (relevantMemory.activeProjectKey || '').toLowerCase();
    const projectNames = relevantMemory.projectNames || {};

    function projectDisplayName(projectKey) {
        if (!projectKey) return 'Unknown Project';
        return projectNames[projectKey.toLowerCase()] || projectKey;
    }

    // Phase 3C.1: Group Project Memory by PROJECT first, then by
    // subject within each project, and label which project each
    // group belongs to.
    //
    // IMPORTANT: this used to group by `subject` alone (e.g.
    // "authentication", "database") with no project_key in the
    // grouping key at all, and label the "active" group by comparing
    // that subject string against the active project's name - which
    // could never match, and meant two different projects that
    // happened to share a subject (e.g. Atlas and Bindex both having
    // an "authentication" memory) were silently merged under one
    // shared, unlabeled header. contextManager.js already scopes
    // `relevantMemory.projects` strictly to the active project and/or
    // any project explicitly named in the message - grouping by
    // project_key here just makes that separation visible to Alice
    // in the prompt itself, instead of losing it during formatting.
    let projectMemoryContext = "None";
    if (relevantMemory.projects && relevantMemory.projects.length > 0) {
        const groupedByProject = {};

        for (const m of relevantMemory.projects) {
            const projectKey = (m.project_key || 'unknown').toLowerCase();
            if (!groupedByProject[projectKey]) groupedByProject[projectKey] = {};

            const subj = m.subject || 'general';
            if (!groupedByProject[projectKey][subj]) groupedByProject[projectKey][subj] = [];
            groupedByProject[projectKey][subj].push(`- ${m.key} = ${m.value}`);
        }

        projectMemoryContext = Object.entries(groupedByProject).map(([projectKey, subjects]) => {
            const isActive = projectKey === activeProjectKey;
            const name = projectDisplayName(projectKey);
            const projectHeader = isActive ? `=== ACTIVE PROJECT: ${name.toUpperCase()} ===` : `=== PROJECT: ${name.toUpperCase()} ===`;

            const subjectBlocks = Object.entries(subjects).map(([subj, items]) =>
                `[${subj.toUpperCase()}]\n${items.join('\n')}`
            ).join('\n\n');

            return `${projectHeader}\n${subjectBlocks}`;
        }).join('\n\n');
    }

    let knowledgeContext = "None";
    if (relevantMemory.knowledge && relevantMemory.knowledge.length > 0) {
        // Transitional formatting (plan §13/§8: this must not become
        // knowledge_library's primary retrieval path - that's the
        // targeted category/subject/topics queries in
        // knowledgeLibrary.js). Previously this omitted `value`
        // entirely (just "- subject: key"), which meant the actual
        // knowledge was never shown to Alice at all. type is only
        // surfaced for non-fact types (assumption/claim/hypothesis)
        // so Alice doesn't present a hedged claim with the same
        // confidence as an established fact.
        //
        // Phase: `topics` was being fetched from the DB (and stored
        // correctly on write - see knowledgeLibrary.js/memoryManager.js)
        // but never actually included here, so it was retrieved and then
        // silently thrown away before Alice ever saw it. Surfacing it
        // lets Alice actually reference what a memory is retrieval-tagged
        // as, instead of the field existing only in the database.
        knowledgeContext = relevantMemory.knowledge.map(k => {
            const category = k.category ? `${k.category}/` : '';
            const hedge = k.type && k.type !== 'fact' ? ` [${k.type}]` : '';
            const topics = Array.isArray(k.topics) && k.topics.length > 0
                ? ` (topics: ${k.topics.join(', ')})`
                : '';
            return `- [${category}${k.subject}] ${k.key} = ${k.value}${hedge}${topics}`;
        }).join('\n');
    }

    let devStateContext = "";
    if (relevantMemory.features && relevantMemory.features.length > 0) {
        devStateContext = `
--- ATLAS OS DEVELOPMENT STATE ---
 ${relevantMemory.features.map(f => `- ${f.feature} [${f.status}]`).join('\n')}
--- END DEV STATE ---
`;
    }

    let proceduralContext = "None";
    if (relevantMemory.procedures && relevantMemory.procedures.length > 0) {
        proceduralContext = relevantMemory.procedures.map(p => `- IF ${p.trigger} THEN ${p.action}`).join('\n');
    }

    let worldModelContext = "";
    // Phase (F3, revised): the world model is the source of truth for what
    // Atlas can do - the trigger below only decides whether this turn needs
    // to see it. Previously that trigger was two literal substrings
    // ("what can you do" / "capabilities"), which missed "can you read your
    // own code?", "do you have file access?", etc. and is exactly the kind
    // of brittle keyword-driven check the rest of this codebase moved away
    // from. Fixed architecture, in priority order:
    //
    //   1. intent.intent === 'capability' - the routing pipeline
    //      (intentCategory.deriveIntentCategory, run once in
    //      conversationEngine.js) already promotes Groq's semantic taskType
    //      to intent.intent for the whole turn when no deterministic tool
    //      fired. This is the normal path and should cover almost every
    //      real capability question.
    //   2. preprocessed.semantic.taskType === 'capability' - a defensive
    //      fallback for the case where the semantic stage ran but its
    //      result never got promoted to intent.intent (e.g. a caller that
    //      built `preprocessed` without going through the shared
    //      conversationEngine flow).
    //   3. deterministicCapabilityMatch(userInput) - a small literal phrase
    //      list, kept ONLY as a fast-path/offline fallback for when Groq is
    //      unavailable or disabled (see preprocessingConfig.js). This must
    //      never be the primary mechanism - semantic classification is.
    const isWorldRelevant = intent.intent === 'memory' ||
        intent.intent === 'capability' ||
        (preprocessed && preprocessed.semantic && preprocessed.semantic.taskType === 'capability') ||
        deterministicCapabilityMatch(userInput);
    if (isWorldRelevant && world) {
        worldModelContext = `
--- ATLAS OS WORLD MODEL ---
Runtime: ${world.environment.runtime} | Model: ${world.models.current_default}
Capabilities:
 ${world.capabilities.map(c => `- ${c}`).join('\n')}
Limitations:
 ${world.limitations.map(l => `- ${l}`).join('\n')}
--- END WORLD MODEL ---
`;
    }

    const systemPrompt = personalityEngine.getSystemPrompt(mode, policy, responseStyle);

    let toolContext = "No tools used.";
    if (toolResult && toolResult.needsTool) {
        // Phase: prefer Gemini's condensed version of the raw tool result
        // (preprocessed.condensedToolResult, from preprocessingLayer's
        // contextualProcessor.condenseToolResult) when the preprocessing
        // layer actually produced one. Search results in particular are
        // 3 full raw source blocks concatenated by searchPipeline.js -
        // previously that entire blob went into Qwen's context unfiltered
        // regardless of whether Gemini condensing ran, because this line
        // only ever read toolResult.toolResult directly. That's the single
        // biggest context-bloat source in the pipeline, and it's exactly
        // what Gemini's contextual stage exists to reduce.
        const resultData = (preprocessed && preprocessed.condensedToolResult)
            ? preprocessed.condensedToolResult
            : toolResult.toolResult;
        toolContext = `Tool Executed: ${toolResult.toolName}\nResult Data:\n${resultData}`;
    }

    // Phase: explicit search-synthesis guidance, appended only for actual
    // web searches. This used to rely entirely on the "search" response
    // style ever actually engaging (see conversationEngine.js's
    // intent.intent fix) - putting the instruction here too means a
    // synthesized answer happens regardless of which style path executes.
    const isWebSearchResult = toolResult && toolResult.needsTool &&
        (toolResult.toolName === 'search_web' || toolResult.toolName === 'webSearch');
    const searchGuideline = isWebSearchResult
        ? '\n- "TOOL CONTEXT" for a web search contains raw source material from multiple related queries, not a finished answer. Read and comprehend all of it, then write ONE complete synthesized answer in your own words. Do not summarize each source or query separately, do not just shorten/quote one snippet, and do not artificially compress a substantive answer down to one or two sentences.'
        : '';

    // Phase (F1): these bullets are meaningless without a tool result -
    // previously they were unconditional, so a plain conversational turn
    // with no tool use still received guidance about "TOOL CONTEXT
    // contains an error" and "CLARIFICATION REQUESTED" for a tool that
    // never ran. Now built only inside the branch where a tool actually
    // executed.
    let toolGuidelines = '';
    if (toolResult && toolResult.needsTool) {
        toolGuidelines = '\n- If "TOOL CONTEXT" contains an error, output the exact error message.\n- If "TOOL CONTEXT" says "CLARIFICATION REQUESTED", ask the user the exact question provided.\n- If "TOOL CONTEXT" contains a list or code, output it exactly without summarizing.' + searchGuideline;
    }

    // Phase: optional preprocessing annotations from the Groq/Gemini
    // pre-contextualization layer. Only present when the layer actually
    // ran (explicitly enabled in .env), so default output is unchanged.
    let preprocessingContext = '';
    if (preprocessed && preprocessed.ran) {
        const notes = [];
        if (preprocessed.semantic) {
            notes.push(`[Groq Semantic Profile] task=${preprocessed.semantic.taskType || 'unknown'} | communication=${preprocessed.semantic.communicationType || 'unknown'} | ambiguous=${preprocessed.semantic.ambiguous === true} | contextRequired=${preprocessed.semantic.contextRequired === true} | memoryRelevant=${preprocessed.semantic.memoryRelevant === true} | needsTools=${preprocessed.semantic.needsTools === true}`);
        }
        if (preprocessed.contextualNotes) {
            notes.push(`[Gemini Context Notes]\n${preprocessed.contextualNotes}`);
        }
        if (notes.length > 0) {
            preprocessingContext = `\n--- PREPROCESSING NOTES ---\n${notes.join('\n')}\n--- END PREPROCESSING NOTES ---\n`;
        }
    }

    // Phase (hallucination fix): Groq's topicFamiliarity read (see
    // semanticAnalyzer.js) is the actual enforcement point for "only know
    // what you know" - personalityEngine.js's EPISTEMIC STANDARDS section
    // already asked Qwen to hedge on its own, but a live bug report
    // (confident, fully fabricated "Neuro-sama is a Tensura antagonist"
    // complete with a details table) confirmed a 4B local model won't
    // reliably self-police that without something concrete to react to.
    // Groq runs first, sees only the raw message, and is a much larger/
    // better-calibrated model - so its own admission of uncertainty about
    // a specific entity is a real signal, not a guess about what Qwen
    // will do. This is deliberately its own block, OUTSIDE the `ran`/
    // notes gate above and phrased as a direct instruction rather than a
    // classification note - "topicFamiliarity=uncertain" sitting quietly
    // inside [Groq Semantic Profile] is exactly the kind of context a
    // small model skims past, the same way it skimmed past the standing
    // epistemic-honesty instruction already in the system prompt.
    let uncertaintyDirective = '';
    if (preprocessed && preprocessed.semantic && preprocessed.semantic.topicFamiliarity === 'uncertain') {
        uncertaintyDirective = `
--- KNOWLEDGE CHECK (do not skip) ---
A preliminary check found you likely do NOT have reliable, specific knowledge of the exact entity/topic in this message - it may be obscure, easily confused with something similarly named, or outside what you actually know. Do not invent specific facts, names, dates, roles, or relationships about it, and do not produce a confident structured answer (list, table, "quick reference") as if you had verified information. Say plainly that you don't have reliable information on this specific topic, and ask if ${atlasState.identity.user} would like you to look it up.
--- END KNOWLEDGE CHECK ---
`;
    }

    // Phase (F1): build the memory block from only the sections that
    // actually have content, and drop the whole "ALICE MEMORY CONTEXT"
    // wrapper (plus its two memory-specific guideline bullets below) when
    // every inner section is empty - a plain conversational turn with no
    // relevant personal/project/knowledge/procedural memory previously
    // still received the full wrapper and guideline text about a memory
    // context that had nothing in it.
    const memoryBlockInner = [
        section('User Profile (Stable Facts):', personalMemoryContext),
        section('Active User State:', userStateContext),
        section('Project Knowledge:', projectMemoryContext),
        section('Knowledge Library Topics:', knowledgeContext)
    ].filter(Boolean).join('\n');

    const memoryBlock = memoryBlockInner
        ? `--- ALICE MEMORY CONTEXT ---\n${memoryBlockInner}--- END MEMORY CONTEXT ---\n\n`
        : '';
    const memoryGuidelines = memoryBlockInner
        ? '\n- "ALICE MEMORY CONTEXT" contains specific facts about the user, your active projects, and things you\'ve directly learned (from conversation, research, or search) and stored in your knowledge library. If "Knowledge Library Topics" contains an entry relevant to this request, treat it as something you actually know and use it - don\'t restate it as a guess and don\'t second-guess it in favor of your own general training. Only fall back to your base training data for topics that aren\'t covered there.\n- Project Knowledge is grouped by project under its own "=== ACTIVE PROJECT: X ===" or "=== PROJECT: X ===" header. Never blend facts from two different project headers together, and never attribute a fact to a project other than the header it appeared under.\n- If asked what you remember about the user or your projects, use the "ALICE MEMORY CONTEXT". DO NOT say you lack personal information if it is listed there.\n- A knowledge entry tagged [assumption], [claim], or [hypothesis] is NOT a verified fact - present it with appropriate hedging (e.g. "I believe..." / "I\'m not certain, but...") rather than stating it as settled.'
        : '';

    const proceduralBlock = section('--- ATLAS OS OPERATIONAL HEURISTICS (PROCEDURES) ---', proceduralContext);
    const proceduralBlockClosed = proceduralBlock ? `${proceduralBlock}--- END HEURISTICS ---\n\n` : '';

    console.timeEnd("buildContext");

    return `${dateLine}\n${systemPrompt}\n${worldModelContext}\n--- CONVERSATION WORKING CONTEXT ---\n${workingContextStr}\n--- END WORKING CONTEXT ---\n${hotStateContext}${preprocessingContext}${memoryBlock}${proceduralBlockClosed}${devStateContext}\n--- TOOL CONTEXT ---\n${toolContext}\n--- END TOOL CONTEXT ---\n${uncertaintyDirective}\n--- CURRENT TASK ---\nIntent: ${intent.intent}\n\n--- RESPONSE GUIDELINES ---\n- Respond directly with only the final answer. Do not narrate reasoning.${toolGuidelines}${memoryGuidelines}\n- Respond naturally as ${atlasState.identity.name}.`;
}

module.exports = { buildContext };