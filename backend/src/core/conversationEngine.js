// backend/src/core/conversationEngine.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const planner = require('../planner/planner');
const memoryExtractor = require('../memory/memoryExtractor');
const semanticEnricher = require('../memory/semanticEnricher');
const reasoningController = require('../reasoning/controller');
const { resolve } = require('../intent/intentResolver');
const { deriveIntentCategory } = require('../intent/intentCategory');
const { hasVerifiedSearchEvidence } = require('../utils/searchEvidence');
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
const memoryCache = require('./memoryCache');
const { extractKeywords } = require('../utils/keywordExtractor');
const { ThinkFilter } = require('../utils/thinkFilter');

const modelAdapter = createModelAdapter();
let lastEmittedModel = null;

// Search answers remain available to the current conversation, but durable
// learning is opt-in while the evidence/provenance pipeline is being hardened.
// This prevents a weak or hallucinated synthesis from silently contaminating
// knowledge_library without disabling Alice's web-search capability.
const SEARCH_KNOWLEDGE_PERSISTENCE_ENABLED = ['true', 'enabled', 'on', '1']
    .includes(String(process.env.SEARCH_KNOWLEDGE_PERSISTENCE || 'false').toLowerCase());

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

        const history = await memory.workingMemory.getHistory(sessionId, 4);
        const userMessageId = await memory.workingMemory.append({ role: 'user', content: userInput }, sessionId);

        // Phase 3C.2: Fetch rolling working context
        const workingContext = await sessionManager.getWorkingContext(sessionId);

        // 2. Planner Route
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'planner', timestamp: Date.now() });
        const plannerStart = Date.now();
        const toolResult = await planner.route(intent, userInput, history, taskId, requestId);
        const plannerDuration = Date.now() - plannerStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'planner', duration: plannerDuration, timestamp: Date.now() });

        const ranWebSearch = toolResult.needsTool &&
            (toolResult.toolName === 'search_web' || toolResult.toolName === 'webSearch');

        // Coarse intent is derived from the route that actually won. Remote
        // Groq/Gemini preprocessing used to sit on every ambiguous turn's
        // critical path; free-tier retries/timeouts made a ~400ms context
        // build block for as long as 47 seconds. Automatic request handling
        // is now local/deterministic. Remote providers remain available
        // behind modelAdapter only when explicitly selected in the future.
        intent.intent = deriveIntentCategory({ toolResult });

        const reasoningDepth = reasoningController.getReasoningOptions(intent, null, userInput);
        const responseStyle = responseController.getResponseStyle(intent);

        let effectiveMode = mode;
        if (mode === 'auto' || !mode) {
            effectiveMode = personalityEngine.inferMode(intent);
        }

        if (toolResult.needsTool) {
            const failed = typeof toolResult.toolResult === 'string' &&
                (toolResult.toolResult.toLowerCase().includes('tool execution failed') ||
                    (ranWebSearch && !hasVerifiedSearchEvidence(toolResult.toolResult)));
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
                // Phase (defense-in-depth): this computed `cleanReply` but
                // then enqueued the raw `instantReply` instead - the
                // prepared text was silently discarded. Also run
                // removeThinkingTraces() here even though deterministic
                // tool output shouldn't normally contain reasoning - it's
                // a one-line safety net, not the primary fix (see the
                // streaming/non-streaming LLM paths below for that).
                const cleanReply = prepareForTTS(responseProcessor.removeThinkingTraces(instantReply));
                ttsManager.enqueue(cleanReply, { requestId });
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

        const llmAdapter = modelAdapter;
        
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
            workingContext,
            sessionId
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
        let completionMeta = null;
        let sentenceBuffer = ''; // Buffer for streaming TTS
        const thinkFilter = new ThinkFilter({
            requestId,
            onLog: message => console.log(message)
        });

        // Emits already-decided-safe text exactly the way raw content used
        // to be emitted: appended to `reply`, streamed to the UI, and fed
        // into the TTS sentence buffer.
        const emitContent = (text) => {
            if (!text) return;
            if (!firstContentEmitted) {
                firstContentEmitted = true;
                // TTFC means first content that is safe and actually visible/
                // speakable—not the first raw content-channel scratchpad token.
                eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
            }
            reply += text;
            eventBus.emit(EventTypes.LLM_TOKEN_STREAM, { taskId, requestId, token: text, tokenType: 'content' });
            sentenceBuffer += text;
            if (/[.!?](\s|$)|\n/.test(sentenceBuffer)) {
                // Defense-in-depth: filterThinking() upstream should have
                // already removed every think tag before text ever reaches
                // here, but this is the actual point where text becomes
                // audio - running removeThinkingTraces() again right here
                // means a gap anywhere upstream (a tag spelled/spaced
                // slightly differently, a future edit to filterThinking,
                // etc.) still can't reach TTS unfiltered. Cheap (plain
                // string ops on a single sentence) and a no-op when the
                // text is already clean.
                const cleanText = prepareForTTS(responseProcessor.removeThinkingTraces(sentenceBuffer.trim()));
                if (cleanText) {
                    ttsManager.enqueue(cleanText, { requestId });
                }
                sentenceBuffer = '';
            }
        };

        try {
            if (llmAdapter.streamComplete) {
                const stream = llmAdapter.streamComplete(messages, { ...reasoning, requestId });
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
                        const safeText = thinkFilter.push(chunk.text);
                        if (safeText) emitContent(safeText);
                    } else if (chunk.type === 'done') {
                        completionMeta = chunk;
                    }
                }

                // Flush a short, ordinary content reply that did not need a
                // delimiter; discard an unfinished reasoning block.
                const tail = thinkFilter.finalize();
                if (tail) emitContent(tail);
            } else {
                reply = await llmAdapter.complete(messages, { ...reasoning, requestId });
                eventBus.emit(EventTypes.LLM_FIRST_TOKEN, { taskId, requestId, llmStart, timestamp: Date.now() });
                
                // If non-streaming, just enqueue the whole reply - but only
                // after stripping thinking traces first. This used to call
                // ttsManager.enqueue(reply, ...) with the raw model output,
                // while the removeThinkingTraces() pass a few lines below
                // only reassigned the local `reply` variable - the TTS
                // queue had already been handed the unfiltered text by
                // then, so a non-streamed reply could speak its reasoning
                // the same way the streaming path could.
                const ttsManager = require('../voice/tts/ttsManager.js');
                if (!firstContentEmitted && reply) {
                    firstContentEmitted = true;
                    eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
                }
                const cleanedForTts = prepareForTTS(responseProcessor.removeThinkingTraces(reply));
                ttsManager.enqueue(cleanedForTts, { requestId });
            }

            // Qwen's thinking and answer share num_predict. If a generation
            // still returns no visible content, retry once with a larger
            // budget before the request is allowed to fail. This is a model-
            // level recovery for every intent, not a prompt-specific patch.
            if (!reply || !reply.trim()) {
                console.warn(
                    `[ResponseRecovery] ${requestId}: no visible content` +
                    `${completionMeta?.doneReason ? ` (done_reason=${completionMeta.doneReason}, evalCount=${completionMeta.evalCount})` : ''}; retrying once.`
                );
                const recoveryMessages = [
                    {
                        role: 'system',
                        content: `${context}\n\nRECOVERY: The prior generation produced no visible answer. Answer the current user message now. Keep private reasoning focused and always complete the visible answer.`
                    },
                    ...messages.slice(1)
                ];
                const recoveryRaw = await llmAdapter.complete(recoveryMessages, {
                    ...reasoning,
                    temperature: Math.min(reasoning.temperature ?? 0.3, 0.2),
                    maxTokens: Math.max((reasoning.maxTokens || 1800) * 2, 3600),
                    requestId: `${requestId}:recovery`
                });
                const recovered = responseProcessor.removeThinkingTraces(recoveryRaw);
                if (recovered) emitContent(recovered);
            }
        } finally {
            const llmDuration = Date.now() - llmStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'llm', duration: llmDuration, timestamp: Date.now() });
        }

        if (!reply || !reply.trim()) {
            emitContent("I couldn't complete that response with the local model, even after retrying it.");
        }

        reply = responseProcessor.processResponse(reply, responseStyle);

        // Flush any remaining text in the buffer
        if (sentenceBuffer.trim()) {
            const ttsManager = require('../voice/tts/ttsManager.js');
            const cleanText = prepareForTTS(responseProcessor.removeThinkingTraces(sentenceBuffer.trim()));
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

                    // Tag the chat-log row for this turn with the
                    // retrieval metadata this extraction pass already
                    // computed - no new LLM call (plan §4). `importance`
                    // is a coarse deterministic signal: 2 if this
                    // message actually produced a saved memory, 1 if it
                    // was merely eligible/extracted but produced nothing
                    // to save, 0 otherwise (messages that never reach
                    // this block, e.g. eligibility.eligible === false
                    // above, keep the default 0/[] from insert time).
                    try {
                        const topics = Array.from(extractKeywords(userInput));
                        const importance = extractedMemory.length > 0 ? 2 : 1;
                        const activeProjectKey = memoryCache.getHotState().activeProject || null;
                        await memory.workingMemory.tagMessage(userMessageId, {
                            topics,
                            projectKey: activeProjectKey,
                            importance
                        });
                    } catch (tagErr) {
                        console.error('[MemoryExtraction_BG] Failed to tag chat log message:', tagErr.message);
                    }
                    
                    // Phase 3C.2: Atomically merge rolling working-context changes.
                    //
                    // conversationUpdate is intentionally treated as a DELTA.
                    // Do not merge it against the request's workingContext snapshot here.
                    // That snapshot may already be stale because background memory extraction
                    // can run concurrently with other requests.
                    if (Object.keys(conversationUpdate).length > 0) {
                        await sessionManager.mergeWorkingContext(
                            sessionId,
                            conversationUpdate
                        );

                        console.log(
                            `[MemoryExtraction_BG] Working Context delta merged.`
                        );
                    }
                } catch (err) {
                    console.error("[MemoryExtraction_BG] Failed:", err.message);
                }
                
                console.timeEnd("[MemoryExtraction_BG] Total Time");
                return null;
        }, taskId, requestId, 'NORMAL');

        // 6b. Background Knowledge Extraction from Web Search
        // (Non-blocking, linked to parent)
        //
        // Previously nothing from a search ever made it into
        // knowledge_library - Alice would have to re-search the same
        // thing later. This runs only when a real web search executed
        // this turn (see the `ranWebSearch` tag above), and feeds the
        // extractor BOTH the synthesized reply just given to the user
        // and the raw aggregated search material, letting it pull
        // whichever actually supports a durable fact - see
        // searchKnowledgeExtractor.js for the full reasoning.
        if (ranWebSearch && SEARCH_KNOWLEDGE_PERSISTENCE_ENABLED) {
            taskManager.createTask('search_knowledge_extraction', async () => {
                console.time("[SearchKnowledgeExtraction_BG] Total Time");
                console.log("[SearchKnowledgeExtraction_BG] Task started...");

                try {
                    const searchKnowledgeExtractor = require('../memory/searchKnowledgeExtractor');

                    const extractionResult = await searchKnowledgeExtractor.extractAndSaveFromSearch({
                        query: userInput,
                        summary: reply,
                        rawResults: toolResult.toolResult
                    });

                    console.log(
                        `[SearchKnowledgeExtraction_BG] Result:`,
                        extractionResult.saved > 0
                            ? `Saved ${extractionResult.saved} knowledge memories.`
                            : `Nothing saved (${extractionResult.reason || extractionResult.error || 'no extractable facts'}).`
                    );

                    if (extractionResult.saved > 0) {
                        memoryCache.invalidate('knowledge_library');
                    }
                } catch (err) {
                    console.error("[SearchKnowledgeExtraction_BG] Failed:", err.message);
                }

                console.timeEnd("[SearchKnowledgeExtraction_BG] Total Time");
                return null;
            }, taskId, requestId, 'NORMAL');
        } else if (ranWebSearch) {
            console.log(
                '[SearchKnowledgeExtraction_BG] Durable persistence is disabled; ' +
                'search evidence remains scoped to this response.'
            );
        }

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
