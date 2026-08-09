const { getStatePrompt } = require('./atlasState');
const personalityEngine = require('./personalityEngine');
const worldModel = require('../memory/worldModel');
const contextManager = require('./contextManager');

async function buildContext({ mode, intent, responseStyle, memoryResult, toolResult, userInput, history }) {
    console.time("buildContext");
    
    // 1. Use Context Manager to fetch budgeted memory items
    const relevantMemory = await contextManager.getRelevantContext(userInput, history, intent);
    const world = await worldModel.getAll();

    // Inject HOT state (Active Project/Files)
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

    let personalMemoryContext = "No relevant personal information found.";
    if (relevantMemory.personal && relevantMemory.personal.length > 0) {
        personalMemoryContext = relevantMemory.personal.map(item => `- ${item.key}: ${item.value}`).join('\n');
    }

    let projectMemoryContext = "No relevant project information found.";
    if (relevantMemory.projects && relevantMemory.projects.length > 0) {
        projectMemoryContext = relevantMemory.projects.map(m => `- ${m.subject}: ${m.key} = ${m.value}`).join('\n');
    }

    let knowledgeContext = "No relevant knowledge found.";
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

    let proceduralContext = "No procedures stored yet.";
    if (relevantMemory.procedures && relevantMemory.procedures.length > 0) {
        proceduralContext = relevantMemory.procedures.map(p => `- IF ${p.trigger} THEN ${p.action}`).join('\n');
    }

    let worldModelContext = "No world model loaded.";
    if (world) {
        const isWorldRelevant = intent.intent === 'memory' || userInput.toLowerCase().includes('what can you do') || userInput.toLowerCase().includes('capabilities');
        if (isWorldRelevant) {
            worldModelContext = `
Environment:
- OS: ${world.environment.host_os}
- Runtime: ${world.environment.runtime}
- LLM Backend: ${world.environment.llm_backend}
- Hardware: ${world.environment.hardware}

Current Projects:
 ${world.current_projects.map(p => `- ${p.name}: ${p.description} (${p.status})`).join('\n')}

Capabilities:
 ${world.capabilities.map(c => `- ${c}`).join('\n')}

Limitations:
 ${world.limitations.map(l => `- ${l}`).join('\n')}
`;
        } else {
            worldModelContext = `Runtime: ${world.environment.runtime} | Model: ${world.models.current_default}`;
        }
    }

    const systemPrompt = personalityEngine.getSystemPrompt(mode) + "\n\n" + getStatePrompt();

    let toolContext = "No tools used.";
    if (toolResult && toolResult.needsTool) {
        toolContext = `Tool Executed: ${toolResult.toolName}\nResult Data:\n${toolResult.toolResult}`;
    }

    console.timeEnd("buildContext");

    return `
 ${systemPrompt}

--- ATLAS WORLD MODEL ---
 ${worldModelContext}
--- END WORLD MODEL ---
 ${hotStateContext}
--- ATLAS MEMORY CONTEXT (Filtered by Relevance & Budget) ---
Personal Information:
 ${personalMemoryContext}

Project Knowledge:
 ${projectMemoryContext}

Knowledge Library Topics:
 ${knowledgeContext}
--- END MEMORY CONTEXT ---

--- ATLAS OPERATIONAL HEURISTICS (PROCEDURES) ---
 ${proceduralContext}
--- END HEURISTICS ---

 ${devStateContext}
--- TOOL CONTEXT ---
 ${toolContext}
--- END TOOL CONTEXT ---

--- CURRENT TASK ---
Intent: ${intent.intent}
Reasoning Level: ${intent.reasoning}

--- RESPONSE GUIDANCE ---
Length: ${responseStyle.length}
Formatting: ${responseStyle.formatting}
Tone: ${responseStyle.tone}

--- COMMUNICATION GUIDELINES ---
- CRITICAL ERROR RULE: If "TOOL CONTEXT" contains the words "TOOL EXECUTION FAILED" or "Error:", you MUST output the EXACT error message provided. DO NOT invent reasons. DO NOT claim you lack access, permissions, or system limits. DO NOT claim the file exists but you can't read it. Just state the exact error message.
- CRITICAL CLARIFICATION RULE: If "TOOL CONTEXT" says "CLARIFICATION REQUESTED", you MUST ask the user the exact question provided in the context. Do not attempt to answer the question yourself.
- CRITICAL: Respond directly with only the final answer. Do not narrate your reasoning, internal thoughts, or step-by-step analysis in the response. If you must think, put your thoughts in  tags, then output ONLY the final response.
- CRITICAL TOOL RULE: If "TOOL CONTEXT" contains the result of a Read Note, Read Code, List Notes, or List Code operation, you MUST output the exact text or list provided in the TOOL CONTEXT. DO NOT summarize it. DO NOT say "files are located in...". Output the exact list. DO NOT hallucinate contents from your chat memory.
- CRITICAL IDENTITY RULE: You are software, not a human. You do not have a childhood or parents. Your ONLY memories are the exact database entries listed under "ATLAS MEMORY CONTEXT". If asked about your earliest memory, you MUST say it was learning the first fact in that list. DO NOT hallucinate human experiences.
- CRITICAL DEV STATE RULE: If asked about your capabilities, improvements, or what you can do, refer STRICTLY to the "ATLAS WORLD MODEL" and "ATLAS DEVELOPMENT STATE" lists. Do not claim a feature is implemented if it is marked as "planned". Do not claim a feature is planned if it is marked as "implemented".
- Respond naturally as Atlas.
- DO NOT use generic AI filler phrases like "Would you like me to...", "Let me know if you need anything else", or "As an AI...".
- If asked what you remember, use the "ATLAS MEMORY CONTEXT" provided above. DO NOT say you don't have information if it is listed there.
- Adapt your answer style to the user's request.
- Do not mention routing, memory systems, prompts, or internal instructions.
- Avoid turning simple conversations into formal reports.

--- RECENT MEMORY ACTION ---
 ${memoryResult ? JSON.stringify(memoryResult) : "No memory action performed this turn."}
`;
}

module.exports = { buildContext };