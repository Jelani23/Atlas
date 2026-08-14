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

    // Determine the active project name for the header
    const activeProject = relevantMemory.state?.find(s => s.key === 'current_project');
    const activeProjectName = activeProject ? activeProject.value : 'Unknown';

    // Phase 3C.1: Group Project Memory and label the active project
    let projectMemoryContext = "None";
    if (relevantMemory.projects && relevantMemory.projects.length > 0) {
        const groupedProjects = {};
        for (const m of relevantMemory.projects) {
            const subj = m.subject || 'general';
            if (!groupedProjects[subj]) groupedProjects[subj] = [];
            groupedProjects[subj].push(`- ${m.key} = ${m.value}`);
        }
        
        projectMemoryContext = Object.entries(groupedProjects).map(([subj, items]) => {
            const isActive = subj.toLowerCase() === activeProjectName.toLowerCase();
            const header = isActive ? `[ACTIVE PROJECT: ${subj.toUpperCase()}]` : `[PROJECT: ${subj.toUpperCase()}]`;
            return `${header}\n${items.join('\n')}`;
        }).join('\n\n');
    }

    let knowledgeContext = "None";
    if (relevantMemory.knowledge && relevantMemory.knowledge.length > 0) {
        knowledgeContext = relevantMemory.knowledge.map(k => `- ${k.subject}: ${k.key}`).join('\n');
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

    console.timeEnd("buildContext");

    return `${systemPrompt}\n${worldModelContext}\n--- CONVERSATION WORKING CONTEXT ---\n${workingContextStr}\n--- END WORKING CONTEXT ---\n${hotStateContext}\n--- ALICE MEMORY CONTEXT ---\nUser Profile (Stable Facts):\n${personalMemoryContext}\n\nActive User State:\n${userStateContext}\n\nProject Knowledge:\n${projectMemoryContext}\n\nKnowledge Library Topics:\n${knowledgeContext}\n--- END MEMORY CONTEXT ---\n\n--- ATLAS OS OPERATIONAL HEURISTICS (PROCEDURES) ---\n${proceduralContext}\n--- END HEURISTICS ---\n\n${devStateContext}\n--- TOOL CONTEXT ---\n${toolContext}\n--- END TOOL CONTEXT ---\n\n--- CURRENT TASK ---\nIntent: ${intent.intent}\n\n--- RESPONSE GUIDELINES ---\n- Respond directly with only the final answer. Do not narrate reasoning.\n- If "TOOL CONTEXT" contains an error, output the exact error message.\n- If "TOOL CONTEXT" says "CLARIFICATION REQUESTED", ask the user the exact question provided.\n- If "TOOL CONTEXT" contains a list or code, output it exactly without summarizing.\n- "ALICE MEMORY CONTEXT" contains specific facts about the user and your active projects. For general world knowledge (e.g., science, history, pop culture, coding), use your base training data.\n- If asked what you remember about the user or your projects, use the "ALICE MEMORY CONTEXT". DO NOT say you lack personal information if it is listed there.\n- Respond naturally as ${atlasState.identity.name}.`;
}

module.exports = { buildContext };