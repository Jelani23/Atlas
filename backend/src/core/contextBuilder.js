// backend/src/core/contextBuilder.js
const { atlasState } = require('./atlasState');
const personalityEngine = require('./personalityEngine');
const worldModel = require('../memory/worldModel');
const contextManager = require('./contextManager');

async function buildContext({ mode, intent, responseStyle, memoryResult, toolResult, userInput, history, policy, workingContext }) {
    console.time("buildContext");
    
    const relevantMemory = await contextManager.getRelevantContext(userInput, history, intent);
    const world = await worldModel.getAll();

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
    const isWorldRelevant = intent.intent === 'memory' || userInput.toLowerCase().includes('what can you do') || userInput.toLowerCase().includes('capabilities');
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
        toolContext = `Tool Executed: ${toolResult.toolName}\nResult Data:\n${toolResult.toolResult}`;
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

    console.timeEnd("buildContext");

    return `${systemPrompt}\n${worldModelContext}\n--- CONVERSATION WORKING CONTEXT ---\n${workingContextStr}\n--- END WORKING CONTEXT ---\n${hotStateContext}\n--- ALICE MEMORY CONTEXT ---\nUser Profile (Stable Facts):\n${personalMemoryContext}\n\nActive User State:\n${userStateContext}\n\nProject Knowledge:\n${projectMemoryContext}\n\nKnowledge Library Topics:\n${knowledgeContext}\n--- END MEMORY CONTEXT ---\n\n--- ATLAS OS OPERATIONAL HEURISTICS (PROCEDURES) ---\n${proceduralContext}\n--- END HEURISTICS ---\n\n${devStateContext}\n--- TOOL CONTEXT ---\n${toolContext}\n--- END TOOL CONTEXT ---\n\n--- CURRENT TASK ---\nIntent: ${intent.intent}\n\n--- RESPONSE GUIDELINES ---\n- Respond directly with only the final answer. Do not narrate reasoning.\n- If "TOOL CONTEXT" contains an error, output the exact error message.\n- If "TOOL CONTEXT" says "CLARIFICATION REQUESTED", ask the user the exact question provided.\n- If "TOOL CONTEXT" contains a list or code, output it exactly without summarizing.${searchGuideline}\n- "ALICE MEMORY CONTEXT" contains specific facts about the user, your active projects, and things you've directly learned (from conversation, research, or search) and stored in your knowledge library. If "Knowledge Library Topics" contains an entry relevant to this request, treat it as something you actually know and use it - don't restate it as a guess and don't second-guess it in favor of your own general training. Only fall back to your base training data for topics that aren't covered there.\n- Project Knowledge is grouped by project under its own "=== ACTIVE PROJECT: X ===" or "=== PROJECT: X ===" header. Never blend facts from two different project headers together, and never attribute a fact to a project other than the header it appeared under.\n- If asked what you remember about the user or your projects, use the "ALICE MEMORY CONTEXT". DO NOT say you lack personal information if it is listed there.\n- A knowledge entry tagged [assumption], [claim], or [hypothesis] is NOT a verified fact - present it with appropriate hedging (e.g. "I believe..." / "I'm not certain, but...") rather than stating it as settled.\n- Respond naturally as ${atlasState.identity.name}.`;
}

module.exports = { buildContext };