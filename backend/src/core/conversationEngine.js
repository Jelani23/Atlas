// backend/src/core/conversationEngine.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const planner = require('../planner/planner');
const memoryExtractor = require('../memory/memoryExtractor');
const semanticEnricher = require('../memory/semanticEnricher');
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
const ttsQueue = require('../voice/tts/ttsQueue');
const ttsManager = require('../voice/tts/ttsManager.js');
const { prepareForTTS } = require('../voice/tts/speechPreprocessor');
const sessionManager = require('../memory/sessionManager');

const modelAdapter = createModelAdapter();
let lastEmittedModel = null;

async function handleMessage(userInput, { memory, mode, sessionId, taskId, requestId }) {
    const requestStart = Date.now();

    try {
        ttsQueue.stop();

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

        const history = await memory.workingMemory.getHistory(sessionId, 4);
        await memory.workingMemory.append({ role: 'user', content: userInput }, sessionId);

        // Phase 3C.2: Fetch rolling working context
        const workingContext = await sessionManager.getWorkingContext(sessionId);

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

        // Short-Circuit for Deterministic Tools & Background Tasks
        if (toolResult.shortCircuit) {
            const instantReply = toolResult.toolResult;
            await memory.workingMemory.append({ role: 'assistant', content: instantReply }, sessionId);
            taskManager.endRequest(taskId);
            eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, requestId, reply: instantReply, timestamp: Date.now(), duration: Date.now() - requestStart });
            
            // Phase 10B: Feed deterministic tool responses straight into TTS pipeline
            try {
                const ttsManager = require('../voice/tts/ttsManager.js');
                const cleanReply = prepareForTTS(instantReply);
                ttsManager.enqueue(instantReply, { requestId });
            } catch (e) {
                console.error("[TTS] Deterministic generation failed:", e.message);
            }

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
            policy: reasoning.policy,
            workingContext
        });
        const contextDuration = Date.now() - contextStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });

        const messages = [
            { role: 'system', content: context },
            ...(await memory.workingMemory.getHistory(sessionId, 4))
        ];

        // 4. Main LLM Complete (Streaming)
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'llm', timestamp: Date.now() });
        const llmStart = Date.now();
        let reply = '';
        let firstTokenEmitted = false;
        let firstContentEmitted = false;
        let isCurrentlyThinking = false;
        let sentenceBuffer = ''; // Buffer for streaming TTS

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

                        // Phase 10E: Sentence Streaming TTS
                        sentenceBuffer += chunk.text;
                        // Check for sentence boundaries (. ! ? or newline)
                        if (/[.!?](\s|$)|\n/.test(sentenceBuffer)) {
                            const cleanText = prepareForTTS(sentenceBuffer.trim());
                            if (cleanText) {
                                ttsManager.enqueue(cleanText, { requestId });
                            }
                            sentenceBuffer = ''; // Clear buffer
                        }
                    }
                }
            } else {
                reply = await modelAdapter.complete(messages, { ...reasoning, requestId });
                eventBus.emit(EventTypes.LLM_FIRST_TOKEN, { taskId, requestId, llmStart, timestamp: Date.now() });
                eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
                
                // If non-streaming, just enqueue the whole reply
                const ttsManager = require('../voice/tts/ttsManager.js');
                ttsManager.enqueue(reply, { requestId });
            }
        } finally {
            const llmDuration = Date.now() - llmStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'llm', duration: llmDuration, timestamp: Date.now() });
        }

        reply = responseProcessor.processResponse(reply, responseStyle);

        if (!reply || !reply.trim()) {
            reply = "I generated a response but it came back empty after processing - possibly ran out of token budget mid-thought. Try again, or ask me something more specific.";
        }

        // Flush any remaining text in the buffer
        if (sentenceBuffer.trim()) {
            const ttsManager = require('../voice/tts/ttsManager.js');
            const cleanText = prepareForTTS(sentenceBuffer.trim());
            if (cleanText) { // Only enqueue if there's actually text left to speak
                ttsManager.enqueue(cleanText, { requestId });
            }
        }

        await memory.workingMemory.append({ role: 'assistant', content: reply }, sessionId);

            // 6. Background Memory Extraction (Non-blocking, linked to parent)
            //
            // Memory extraction is intentionally independent of tool routing.
            // A request may require clarification, a tool, or another action
            // while still containing information worth remembering.
            //
            // The eligibility filter is responsible for deciding whether the
            // message should actually be extracted.
            taskManager.createTask('memory_extraction', async () => {
                console.time("[MemoryExtraction_BG] Total Time");
                console.log("[MemoryExtraction_BG] Task started...");
                
                try {
                    // Phase 3C.4 (Step 2): Memory Eligibility Filter
                    const { checkEligibility } = require('../memory/memoryEligibility');
                    const eligibility = await checkEligibility(userInput);
                    console.log('[MemoryEligibility DEBUG] Result:', eligibility);
                    console.log('[MemoryEligibility DEBUG] Type:', typeof eligibility);
                    console.log(
                        '[MemoryEligibility DEBUG] Module:',
                        require.resolve('../memory/memoryEligibility')
                    );
                    
                    console.log(`[MemoryEligibility] Score: ${eligibility.score} | Decision: ${eligibility.eligible ? 'EXTRACT' : 'SKIP'} | Reason: ${eligibility.reason}`);
                    
                    if (!eligibility.eligible) {
                        console.timeEnd("[MemoryExtraction_BG] Total Time");
                        return null;
                    }

                    // Phase 3C.4 (Step 4): Deterministic Fast-Path
                    const deterministic = require('../memory/deterministicExtractor');

                    let extracted = await deterministic.extract(userInput);

                    if (extracted.deterministic) {
                        console.log(
                            `[MemoryExtraction_BG] Deterministic hit!`
                        );

                        if (extracted.deterministic) {
                            console.log(
                                `[MemoryExtraction_BG] Deterministic hit!`
                            );

                            console.time(
                                "[MemoryExtraction_BG] Semantic Enrichment"
                            );

                            extracted.memories =
                                await semanticEnricher.enrichMemories(
                                    extracted.memories
                                );

                            console.timeEnd(
                                "[MemoryExtraction_BG] Semantic Enrichment"
                            );
                        }

                    } else {
                        console.time("[MemoryExtraction_BG] LLM Extraction");

                        extracted =
                            await memoryExtractor.extractMemory(
                                userInput,
                                workingContext
                            );

                        console.timeEnd("[MemoryExtraction_BG] LLM Extraction");
                    }
                    
                    const extractedMemory = extracted.memories || [];
                    const conversationUpdate = extracted.conversation_update || {};

                    console.log(
                        `[MemoryExtraction_BG] Extracted for "${userInput}":`,
                        JSON.stringify(extractedMemory, null, 2)
                    );

                    let memoriesToSave = extractedMemory;

                    console.time("[MemoryExtraction_BG] DB Save");

                    const saveResult =
                        await memoryManager.handleMemoryAction(
                            memoriesToSave
                        );

                    console.timeEnd("[MemoryExtraction_BG] DB Save");

                    console.log(
                        `[MemoryExtraction_BG] Save Result:`,
                        saveResult.action
                    );
                    
                    // Phase 3C.2: Update rolling working context
                    if (Object.keys(conversationUpdate).length > 0) {
                        const newContext = { ...workingContext, ...conversationUpdate };
                        await sessionManager.updateWorkingContext(sessionId, newContext);
                        console.log(`[MemoryExtraction_BG] Working Context updated.`);
                    }
                } catch (err) {
                    console.error("[MemoryExtraction_BG] Failed:", err.message);
                }
                
                console.timeEnd("[MemoryExtraction_BG] Total Time");
                return null;
        }, taskId, requestId, 'NORMAL');

        // 5. Emit Request Completed (This triggers the task manager to run the background task)
        taskManager.endRequest(taskId);
        eventBus.emit(EventTypes.REQUEST_COMPLETED, { taskId, requestId, reply, timestamp: Date.now(), duration: Date.now() - requestStart });

        // Phase 10E: Return immediately, audio is streamed via events
        return { reply, audio: null };

    } catch (error) {
        taskManager.endRequest(taskId);
        console.error("[Atlas] handleMessage failed:", error);
        const fallback = "Something went wrong on my end processing that - try again?";
        eventBus.emit(EventTypes.REQUEST_FAILED, { taskId, requestId, error: error.message, timestamp: Date.now(), duration: Date.now() - requestStart });
        return { reply: fallback, audio: null };
    }
}

module.exports = { handleMessage };