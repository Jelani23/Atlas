// backend/src/core/contextBuilder.js
const { atlasState } = require('./atlasState');
const personalityEngine = require('./personalityEngine');
const worldModel = require('../memory/worldModel');
const contextManager = require('./contextManager');
const { SEARCH_STATUS, hasVerifiedSearchEvidence } = require('../utils/searchEvidence');
const { classifyUserNote } = require('../utils/turnGrounding');

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

// Keep all gathered search perspectives represented when raw pages are large.
// A simple prefix slice lets source 1 consume the whole allowance and silently
// removes sources 2/3, defeating cross-checking. This allocator preserves the
// status/header and gives every source block an equal deterministic share.
function compactSearchEvidence(raw, maxChars = 12000) {
    const text = String(raw || '');
    if (text.length <= maxChars) return text;

    const parts = text.split(/(?=--- Source material \d+)/i);
    if (parts.length <= 1) {
        return `${text.slice(0, maxChars)}\n[Additional search material omitted from synthesis context.]`;
    }

    const header = parts.shift().slice(0, 1000);
    const footer = '\n[Additional text from each source was omitted from synthesis context.]';
    const available = Math.max(1000, maxChars - header.length - footer.length);
    const perSource = Math.max(500, Math.floor(available / parts.length));
    return `${header}${parts.map(part => part.slice(0, perSource)).join('')}${footer}`;
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

async function buildContext({ mode, intent, responseStyle, memoryResult, toolResult, userInput, history, policy, workingContext, preprocessed, sessionId }) {
    console.time("buildContext");
    
    // Phase: when the optional preprocessing layer already retrieved (and
    // possibly Gemini-filtered) the relevant context, reuse it instead of
    // running the retrieval flow a second time. When `preprocessed` is
    // absent or has no relevantMemory, behavior is identical to before.
    const relevantMemory = (preprocessed && preprocessed.relevantMemory)
        ? preprocessed.relevantMemory
        : await contextManager.getRelevantContext(userInput, history, intent, { sessionId });

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
            const source = k.source
                ? ` (source: ${k.source_type || 'unknown'} / ${k.source})`
                : ` (source: ${k.source_type || 'unknown'}; reference unavailable)`;
            return `- [${category}${k.subject}] ${k.key} = ${k.value}${hedge}${topics}${source}`;
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

    // Reflections: session-scoped recaps, distinct from Knowledge Library
    // Topics above (durable facts) - see memory/reflectionEngine.js. Kept
    // dense and tag-first (subject/category leading, topics trailing) since
    // this is written for Alice to parse quickly, not as narrative prose.
    let reflectionContext = "None";
    if (relevantMemory.reflections && relevantMemory.reflections.length > 0) {
        reflectionContext = relevantMemory.reflections.map(r => {
            const topics = Array.isArray(r.topics) && r.topics.length > 0
                ? ` (topics: ${r.topics.join(', ')})`
                : '';
            const title = r.session_title ? `; title: ${r.session_title}` : '';
            const session = r.session_id ? `session ${r.session_id}${title}` : 'legacy session';
            const reflectedAt = r.timestamp || 'unknown date';
            const details = [
                ['Anchors', r.anchors],
                ['Comparisons', r.comparisons],
                ['User positions/decisions', r.decisions],
                ['Open loops', r.open_loops]
            ]
                .filter(([, values]) => Array.isArray(values) && values.length > 0)
                .map(([label, values]) => `${label}: ${values.join(' | ')}`)
                .join('; ');
            const evidence = details ? `Structured evidence: ${details}; ` : '';
            return `- [${session}; ${reflectedAt}; ${r.subject}/${r.category}] ` +
                `${evidence}Lossy overview: ${r.summary}${topics}`;
        }).join('\n');
    }

    // Topic-matched turns from earlier in the CURRENT session. Recent turns
    // are still supplied as normal chat messages; contextManager removes
    // those from this list so this block only fills the gap beyond the
    // short recency window.
    let earlierConversationContext = "None";
    if (relevantMemory.conversationHistory && relevantMemory.conversationHistory.length > 0) {
        earlierConversationContext = relevantMemory.conversationHistory.map(message => {
            const role = message.role === 'assistant' ? 'Alice' : 'User';
            return `- ${role}: ${message.content}`;
        }).join('\n');
    }
    const earlierConversationBlock = section(
        '--- RELEVANT EARLIER CONVERSATION (CURRENT SESSION) ---',
        earlierConversationContext
    );
    const earlierConversationBlockClosed = earlierConversationBlock
        ? `${earlierConversationBlock}--- END EARLIER CONVERSATION ---\n\n`
        : '';

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
    const world = isWorldRelevant ? await worldModel.getAll() : null;
    if (world) {
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

    const isWebSearchResult = toolResult && toolResult.needsTool && (
        toolResult.hasWebSearch === true ||
        toolResult.toolName === 'search_web' ||
        toolResult.toolName === 'webSearch'
    );
    let toolContext = '';
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
        let resultData = (preprocessed && preprocessed.condensedToolResult)
            ? preprocessed.condensedToolResult
            : toolResult.toolResult;
        // Remote LLM condensation is no longer on the critical path. Put a
        // deterministic ceiling on raw web material so one unusually large
        // result page cannot crowd the instructions and conversation out of
        // a small local model's context. Status and source ordering survive.
        if (Array.isArray(toolResult.toolResults)) {
            resultData = toolResult.toolResults.map((step, index) => {
                const stepResult = step.isWebSearch
                    ? compactSearchEvidence(step.result)
                    : step.result;
                return `Task ${index + 1} — ${step.toolName}:\n${stepResult}`;
            }).join('\n\n');
        } else if (isWebSearchResult) {
            resultData = compactSearchEvidence(resultData);
        }
        toolContext = `Tool Executed: ${toolResult.toolName}\nResult Data:\n${resultData}`;
    }

    // Phase: explicit search-synthesis guidance, appended only for actual
    // web searches. This used to rely entirely on the "search" response
    // style ever actually engaging (see conversationEngine.js's
    // intent.intent fix) - putting the instruction here too means a
    // synthesized answer happens regardless of which style path executes.
    const searchHasEvidence = isWebSearchResult && hasVerifiedSearchEvidence(
        toolResult.searchEvidence || toolResult.toolResult
    );
    const searchGuideline = !isWebSearchResult
        ? ''
        : searchHasEvidence
            ? '\n- For current claims, use only the supplied web evidence. Synthesize the source blocks into one answer.'
            : '\n- Search returned no verified evidence. Say you could not verify the current answer; do not substitute an old remembered fact.';

    // Phase (F1): these bullets are meaningless without a tool result -
    // previously they were unconditional, so a plain conversational turn
    // with no tool use still received guidance about "TOOL CONTEXT
    // contains an error" and "CLARIFICATION REQUESTED" for a tool that
    // never ran. Now built only inside the branch where a tool actually
    // executed.
    let toolGuidelines = '';
    if (toolResult && toolResult.needsTool) {
        toolGuidelines = '\n- If the tool failed or requested clarification, report that result plainly. Preserve exact code or data when the user requested it.' + searchGuideline;
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
        uncertaintyDirective = `\nKNOWLEDGE CHECK: The exact topic may be unfamiliar or ambiguous. Do not invent specifics; say what is uncertain and offer to look it up.\n`;
    }

    const isTimeSensitiveRequest = /\b(latest|current|today|recent|newest|now|this (?:year|month|week)|as of)\b/i.test(userInput || '');
    const currentInformationDirective = isTimeSensitiveRequest
        ? `\nCURRENT INFORMATION: Use verified evidence from this turn for latest/current claims. If evidence is missing or reports ${SEARCH_STATUS.NO_RESULTS}, say the current answer could not be verified.\n`
        : '';

    const userNoteType = classifyUserNote(userInput);
    const userNoteDirective = userNoteType
        ? `\nCURRENT USER NOTE: This message is a new ${userNoteType.replace('_', ' ')}. Acknowledge only what the user stated. Do not say ATLAS already implements it, that no changes are needed, or invent supporting examples, fields, schedules, thresholds, timestamps, or automation. Keep the reply to one short acknowledgment unless the user asked for more.\n`
        : '';

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
        section('Remembered Project Context (not implementation proof):', projectMemoryContext),
        section('Knowledge Library (may be stale or unverified):', knowledgeContext),
        section('Past Session Reflections:', reflectionContext)
    ].filter(Boolean).join('\n');

    const memoryBlock = memoryBlockInner
        ? `--- ALICE MEMORY CONTEXT ---\n${memoryBlockInner}--- END MEMORY CONTEXT ---\n\n`
        : '';
    const memoryGuidelines = memoryBlockInner
        ? '\n- Use relevant supplied memory. Keep project headers separate. Hedge entries tagged assumption/claim/hypothesis. Knowledge provenance does not imply verification, freshness, or implementation. Reflections summarize past sessions and provide continuity; they are not independently verified facts. For a requested session, structured reflection evidence outranks its lossy overview and earlier assistant replies. Previous assistant replies are not memory evidence. When a requested past-session detail is absent, say the available reflection does not include it. Do not claim a database-wide search or offer to reconstruct unavailable cross-session chat.'
        : '';
    const conversationHistoryGuideline = earlierConversationBlock
        ? '\n- Earlier conversation is current-session dialogue: use it for continuity, not as independently verified long-term memory.'
        : '';

    const proceduralBlock = section('--- ATLAS OS BEHAVIORAL HEURISTICS (NOT IMPLEMENTATION STATE) ---', proceduralContext);
    const proceduralBlockClosed = proceduralBlock ? `${proceduralBlock}--- END HEURISTICS ---\n\n` : '';

    console.timeEnd("buildContext");

    const workingBlock = workingContextStr === 'None'
        ? ''
        : `\n--- CURRENT SESSION STATE ---\n${workingContextStr}\n--- END SESSION STATE ---\n`;
    const toolBlock = toolContext
        ? `\n--- TOOL EVIDENCE ---\n${toolContext}\n--- END TOOL EVIDENCE ---\n`
        : '';

    return [
        dateLine,
        systemPrompt,
        worldModelContext,
        workingBlock,
        hotStateContext,
        earlierConversationBlockClosed,
        preprocessingContext,
        memoryBlock,
        proceduralBlockClosed,
        devStateContext,
        toolBlock,
        uncertaintyDirective,
        currentInformationDirective,
        userNoteDirective,
        `TURN RULES\n- Answer the current user message directly.${toolGuidelines}${memoryGuidelines}${conversationHistoryGuideline}\n- Only current tool evidence or an exact Development State entry can support a claim that a feature, schema field, policy, or automation is implemented. Project memory, knowledge, procedures, reflections, and assistant messages cannot prove implementation. Never invent implementation status, verification state, expiry periods, or background behavior.\n- Respond naturally as ${atlasState.identity.name}.`
    ].filter(Boolean).join('\n');
}

module.exports = { buildContext, compactSearchEvidence };
