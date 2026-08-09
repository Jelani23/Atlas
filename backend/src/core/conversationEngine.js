// backend/src/core/conversationEngine.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const planner = require('../planner/planner');
const memoryExtractor = require('../memory/memoryExtractor');
const reasoningController = require('../reasoning/controller');
const intentRouter = require('../intent/router');
const responseController = require('../response/controller');
const memoryManager = require('../memory/memoryManager');
const contextBuilder = require('./contextBuilder');
const responseProcessor = require('../response/processor');
const personalityEngine = require('./personalityEngine');
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');
const taskManager = require('../tasks/taskManager');

const modelAdapter = createModelAdapter();
let lastEmittedModel = null;

async function handleMessage(userInput, { memory, mode, sessionId, taskId, requestId }) {
    console.time(`[${taskId}] TotalHandleMessage`);

    try {
        taskManager.startRequest(taskId);
        // 1. Emit Request Started
        eventBus.emit(EventTypes.REQUEST_STARTED, { taskId, requestId, text: userInput });
        eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, stage: 'intent' });
        
        console.time("IntentRoute");
        const intent = await intentRouter.route(userInput);
        console.timeEnd("IntentRoute");

        const reasoningDepth = reasoningController.getReasoningOptions(intent);
        const responseStyle = responseController.getResponseStyle(intent);

        let effectiveMode = mode;
        if (mode === 'auto' || !mode) {
            effectiveMode = personalityEngine.inferMode(intent);
        }

        console.log("\n[Atlas Routing]");
        console.log("Intent:", intent.intent);
        console.log("Reasoning:", intent.reasoning);
        console.log("Personality Mode:", effectiveMode);
        console.log();

        const history = await memory.workingMemory.getHistory(sessionId);
        await memory.workingMemory.append({ role: 'user', content: userInput }, sessionId);

        // 2. Planner Route
        eventBus.emit(EventTypes.TOOL_STARTED, { taskId, phase: 'planning' });
        console.time("PlannerRoute");
        const toolResult = await planner.route(intent, userInput, history);
        console.timeEnd("PlannerRoute");

        if (toolResult.needsTool) {
            const failed = typeof toolResult.toolResult === 'string' &&
                toolResult.toolResult.toLowerCase().includes('tool execution failed');
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, tool: toolResult.toolName, success: !failed });
        } else {
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, tool: null, success: true });
        }

        // Short-Circuit for Background Tasks
        if (toolResult.shortCircuit) {
            console.log(`[${taskId}] Short-circuiting main LLM. Returning instant background acknowledgement.`);
            const instantReply = toolResult.toolResult;
            await memory.workingMemory.append({ role: 'assistant', content: instantReply }, sessionId);
            taskManager.endRequest(taskId);
            eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, reply: instantReply });
            console.timeEnd(`[${taskId}] TotalHandleMessage`);
            return instantReply;
        }

        const modelChoice = modelRouter.getModelForTask(toolResult.toolName);
        const reasoning = { ...reasoningDepth, ...modelChoice };
        if (modelChoice.supportsThinking === false) {
            reasoning.think = false;
        }
        
        eventBus.emit(EventTypes.MODEL_SELECTED, { taskId, model: reasoning.model, reason: reasoning.reason });

        // 3. Build Context (Memory Extraction is now deferred to background)
        eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, stage: 'context' });
        console.time("BuildContext");
        const context = await contextBuilder.buildContext({
            mode: effectiveMode,
            intent,
            responseStyle,
            memoryResult: { action: "deferred", message: "Processing in background" },
            toolResult,
            userInput,
            history
        });
        console.timeEnd("BuildContext");

        const messages = [
            { role: 'system', content: context },
            ...(await memory.workingMemory.getHistory(sessionId))
        ];

        // 4. Main LLM Complete
        eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, stage: 'generating' });
        console.time("LLMComplete");
        let reply;
        try {
            reply = await modelAdapter.complete(messages, reasoning);
        } finally {
            console.timeEnd("LLMComplete");
        }

        reply = responseProcessor.processResponse(reply, responseStyle);

        if (!reply || !reply.trim()) {
            console.warn("[Atlas] LLM returned an empty reply after processing - likely hit maxTokens before any answer content was generated. Raw response was truncated or all-thinking.");
            reply = "I generated a response but it came back empty after processing - possibly ran out of token budget mid-thought. Try again, or ask me something more specific.";
        }

        await memory.workingMemory.append({ role: 'assistant', content: reply }, sessionId);

        // 5. Emit Request Completed
        taskManager.endRequest(taskId);
        eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, reply });
        console.timeEnd(`[${taskId}] TotalHandleMessage`);
        
        // 6. Background Memory Extraction (Non-blocking)
        if (!toolResult.needsTool) {
            console.log(`[${taskId}] Dispatching background memory extraction task...`);
            taskManager.createTask('memory_extraction', async () => {
                console.time("[MemoryExtraction_BG]");
                try {
                    const extractedMemory = await memoryExtractor.extractMemory(userInput, history);
                    await memoryManager.handleMemoryAction(extractedMemory);
                } catch (err) {
                    console.error("[MemoryExtraction_BG] Failed:", err.message);
                } finally {
                    console.timeEnd("[MemoryExtraction_BG]");
                }
                return null;
            });
        }
        
        return reply;
    } catch (error) {
        taskManager.endRequest(taskId);
        console.error("[Atlas] handleMessage failed:", error);
        console.timeEnd(`[${taskId}] TotalHandleMessage`);
        const fallback = "Something went wrong on my end processing that - try again?";
        eventBus.emit(EventTypes.REQUEST_FAILED, { taskId, error: error.message });
        return fallback;
    }
}

module.exports = { handleMessage };