// backend/src/core/contextBuilder.js
const { getStatePrompt } = require('./atlasState');
const personalityEngine = require('./personalityEngine');
const worldModel = require('../memory/worldModel');
const contextManager = require('./contextManager');

// ADD 'policy' to the destructured arguments
async function buildContext({ mode, intent, responseStyle, memoryResult, toolResult, userInput, history, policy }) {
    console.time("buildContext");
    
    const relevantMemory = await contextManager.getRelevantContext(userInput, history, intent);
    const world = await worldModel.getAll();

    let hotStateContext = "";
    const hot = relevantMemory.hotState;
    if (hot.activeProject || hot.activeFiles.length > 0 || hot.currentTask) {
        hotStateContext = `
--- ATLAS HOT CONTEXT (Current Working State) ---
Active Project: ${hot.activeProject || 'None'}
Active Files: ${hot.activeFiles.length > 0 ? hot.activeFiles.join(', ') : 'None'}
Current Task: ${hot.currentTask || 'None'}
--- END HOT CONTEXT ---
`;
    }

    let personalMemoryContext = "None";
    if (relevantMemory.personal && relevantMemory.personal.length > 0) {
        personalMemoryContext = relevantMemory.personal.map(item => `- ${item.key}: ${item.value}`).join('\n');
    }

    let projectMemoryContext = "None";
    if (relevantMemory.projects && relevantMemory.projects.length > 0) {
        projectMemoryContext = relevantMemory.projects.map(m => `- ${m.subject}: ${m.key} = ${m.value}`).join('\n');
    }

    let knowledgeContext = "None";
    if (relevantMemory.knowledge && relevantMemory.knowledge.length > 0) {
        knowledgeContext = relevantMemory.knowledge.map(k => `- ${k.subject}: ${k.key}`).join('\n');
    }

    let devStateContext = "";
    if (relevantMemory.features && relevantMemory.features.length > 0) {
        devStateContext = `
--- ATLAS DEVELOPMENT STATE ---
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
--- ATLAS WORLD MODEL ---
Runtime: ${world.environment.runtime} | Model: ${world.models.current_default}
Capabilities:
 ${world.capabilities.map(c => `- ${c}`).join('\n')}
Limitations:
 ${world.limitations.map(l => `- ${l}`).join('\n')}
--- END WORLD MODEL ---
`;
    }

    // PASS policy to getSystemPrompt
    const systemPrompt = personalityEngine.getSystemPrompt(mode, policy);

    let toolContext = "No tools used.";
    if (toolResult && toolResult.needsTool) {
        toolContext = `Tool Executed: ${toolResult.toolName}\nResult Data:\n${toolResult.toolResult}`;
    }

    console.timeEnd("buildContext");

    return `${systemPrompt}\n${worldModelContext}\n${hotStateContext}\n--- ATLAS MEMORY CONTEXT ---\nPersonal Information:\n${personalMemoryContext}\n\nProject Knowledge:\n${projectMemoryContext}\n\nKnowledge Library Topics:\n${knowledgeContext}\n--- END MEMORY CONTEXT ---\n\n--- ATLAS OPERATIONAL HEURISTICS (PROCEDURES) ---\n${proceduralContext}\n--- END HEURISTICS ---\n\n${devStateContext}\n--- TOOL CONTEXT ---\n${toolContext}\n--- END TOOL CONTEXT ---\n\n--- CURRENT TASK ---\nIntent: ${intent.intent}\n\n--- RESPONSE GUIDELINES ---\n- Respond directly with only the final answer. Do not narrate reasoning.\n- If "TOOL CONTEXT" contains an error, output the exact error message.\n- If "TOOL CONTEXT" says "CLARIFICATION REQUESTED", ask the user the exact question provided.\n- If "TOOL CONTEXT" contains a list or code, output it exactly without summarizing.\n- If asked what you remember, use the "ATLAS MEMORY CONTEXT". DO NOT say you lack information if it is listed there.\n- Respond naturally as Atlas.`;
}

module.exports = { buildContext };