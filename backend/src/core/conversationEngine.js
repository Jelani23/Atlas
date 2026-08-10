// backend/src/core/conversationEngine.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const planner = require('../planner/planner');
const memoryExtractor = require('../memory/memoryExtractor');
const reasoningController = require('../reasoning/controller');
const { resolve } = require('../intent/intentResolver');
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
    const requestStart = Date.now();

    try {
        taskManager.startRequest(taskId, requestId);
        eventBus.emit(EventTypes.REQUEST_STARTED, { taskId, requestId, text: userInput, timestamp: requestStart });
        
        // 1. Intent Route
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'intent', timestamp: Date.now() });
        const intentStart = Date.now();
        const intent = resolve(userInput);
        const intentDuration = Date.now() - intentStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'intent', duration: intentDuration, timestamp: Date.now() });

        const reasoningDepth = reasoningController.getReasoningOptions(intent);
        const responseStyle = responseController.getResponseStyle(intent);

        let effectiveMode = mode;
        if (mode === 'auto' || !mode) {
            effectiveMode = personalityEngine.inferMode(intent);
        }

        const history = await memory.workingMemory.getHistory(sessionId);
        await memory.workingMemory.append({ role: 'user', content: userInput }, sessionId);

        // 2. Planner Route
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'planner', timestamp: Date.now() });
        const plannerStart = Date.now();
        const toolResult = await planner.route(intent, userInput, history, taskId, requestId);
        const plannerDuration = Date.now() - plannerStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'planner', duration: plannerDuration, timestamp: Date.now() });

        if (toolResult.needsTool) {
            const failed = typeof toolResult.toolResult === 'string' &&
                toolResult.toolResult.toLowerCase().includes('tool execution failed');
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, requestId, tool: toolResult.toolName, success: !failed, timestamp: Date.now() });
        } else {
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, requestId, tool: null, success: true, timestamp: Date.now() });
        }

        // Short-Circuit for Background Tasks
        if (toolResult.shortCircuit) {
            const instantReply = toolResult.toolResult;
            await memory.workingMemory.append({ role: 'assistant', content: instantReply }, sessionId);
            taskManager.endRequest(taskId);
            eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, requestId, reply: instantReply, timestamp: Date.now(), duration: Date.now() - requestStart });
            // Return object with audio: null so the type is consistent
            return { reply: instantReply, audio: null };
        }

        const modelChoice = modelRouter.getModelForTask(toolResult.toolName);
        const reasoning = { ...reasoningDepth, ...modelChoice };
        if (modelChoice.supportsThinking === false) {
            reasoning.think = false;
        }
        
        // Phase 8B: LLM Call Attribution
        const llmReason = toolResult.needsTool && !toolResult.shortCircuit 
            ? 'tool_interpretation' 
            : 'response_generation';
            
        eventBus.emit(EventTypes.MODEL_SELECTED, { taskId, requestId, model: reasoning.model, reason: llmReason, timestamp: Date.now() });

        // 3. Build Context
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'context', timestamp: Date.now() });
        const contextStart = Date.now();
        const context = await contextBuilder.buildContext({
            mode: effectiveMode,
            intent,
            responseStyle,
            memoryResult: { action: "deferred", message: "Processing in background" },
            toolResult,
            userInput,
            history,
            policy: reasoning.policy
        });
        const contextDuration = Date.now() - contextStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });

        const messages = [
            { role: 'system', content: context },
            ...(await memory.workingMemory.getHistory(sessionId))
        ];

        // 4. Main LLM Complete (Streaming)
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'llm', timestamp: Date.now() });
        const llmStart = Date.now();
        let reply = '';
        let firstTokenEmitted = false;
        let firstContentEmitted = false;
        let isCurrentlyThinking = false;

        try {
            if (modelAdapter.streamComplete) {
                const stream = modelAdapter.streamComplete(messages, { ...reasoning, requestId });
                for await (const chunk of stream) {
                    if (!firstTokenEmitted) {
                        firstTokenEmitted = true;
                        eventBus.emit(EventTypes.LLM_FIRST_TOKEN, { taskId, requestId, llmStart, timestamp: Date.now() });
                    }
                    
                    if (chunk.type === 'thinking') {
                        if (!isCurrentlyThinking) {
                            isCurrentlyThinking = true;
                            eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, requestId, stage: 'thinking', timestamp: Date.now() });
                        }
                        // Telemetry only: do not append to reply
                        eventBus.emit(EventTypes.LLM_TOKEN_STREAM, { taskId, requestId, token: chunk.text, tokenType: 'thinking' });
                    } else if (chunk.type === 'content') {
                        if (isCurrentlyThinking) {
                            isCurrentlyThinking = false;
                            eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, requestId, stage: 'generating', timestamp: Date.now() });
                        }
                        if (!firstContentEmitted) {
                            firstContentEmitted = true;
                            eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
                        }
                        reply += chunk.text;
                        eventBus.emit(EventTypes.LLM_TOKEN_STREAM, { taskId, requestId, token: chunk.text, tokenType: 'content' });
                    }
                }
            } else {
                reply = await modelAdapter.complete(messages, { ...reasoning, requestId });
                eventBus.emit(EventTypes.LLM_FIRST_TOKEN, { taskId, requestId, llmStart, timestamp: Date.now() });
                eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
            }
        } finally {
            const llmDuration = Date.now() - llmStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'llm', duration: llmDuration, timestamp: Date.now() });
        }

        reply = responseProcessor.processResponse(reply, responseStyle);

        if (!reply || !reply.trim()) {
            reply = "I generated a response but it came back empty after processing - possibly ran out of token budget mid-thought. Try again, or ask me something more specific.";
        }

        await memory.workingMemory.append({ role: 'assistant', content: reply }, sessionId);

        // 5. Emit Request Completed
        taskManager.endRequest(taskId);
        eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, requestId, reply, timestamp: Date.now(), duration: Date.now() - requestStart });
        
        // 6. Background Memory Extraction (Non-blocking, linked to parent)
        if (!toolResult.needsTool) {
            taskManager.createTask('memory_extraction', async () => {
                try {
                    const extractedMemory = await memoryExtractor.extractMemory(userInput, history);
                    await memoryManager.handleMemoryAction(extractedMemory);
                } catch (err) {
                    console.error("[MemoryExtraction_BG] Failed:", err.message);
                }
                return null;
            }, taskId, requestId, 'NORMAL'); // Pass priority
        }
        // 7. Text-to-Speech (Phase 10E)
        let audioBase64 = null;
        try {
            // Require it RIGHT HERE, inside the function
            const ttsManager = require('../voice/tts/ttsManager.js'); 
            const ttsResult = await ttsManager.speak(reply);
            if (ttsResult) {
                audioBase64 = `data:audio/${ttsResult.format};base64,${ttsResult.buffer.toString('base64')}`;
            }
        } catch (e) {
            console.error("[TTS] Generation failed:", e.message);
        }

        return { reply, audio: audioBase64 };

    } catch (error) {
        taskManager.endRequest(taskId);
        console.error("[Atlas] handleMessage failed:", error);
        const fallback = "Something went wrong on my end processing that - try again?";
        eventBus.emit(EventTypes.REQUEST_FAILED, { taskId, requestId, error: error.message, timestamp: Date.now(), duration: Date.now() - requestStart });
        return { reply: fallback, audio: null };
    }
}

module.exports = { handleMessage };