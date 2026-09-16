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
const { formatImmediateToolReply } = require('../response/toolResultPresenter');
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
const contextManager = require('./contextManager');
const { resolveReflectionAnswer } = require('../memory/reflectionAnswerResolver');
const {
    resolveUserNoteReply,
    resolveImplementationBoundaryReply,
    resolveTrustedKnowledgeBoundaryReply
} = require('../utils/turnGrounding');
const { isSearchKnowledgePersistenceEnabled } = require('../memory/knowledgePersistencePolicy');
const { shouldRecoverResponse, getRecoveryAppend } = require('../response/recovery');
const { hasOperatingGuideAnswer, isKnowledgePipelineExplanation, formatToolInventory, selectTopics } = require('./capabilityContext');
const { isToolInventoryRequest } = require('../intent/capabilityRequest');
const { resolveKnowledgeOverviewReply } = require('../memory/knowledgeAnswerBoundary');
const { resolveOperatingAnswer, resolveEmptyEventRecall } = require('../response/groundedAnswers');
const { resolvePreferenceComparison } = require('../response/preferenceAnswers');
const { getAgentProfile } = require('../agents/agentProfiles');

const modelAdapter = createModelAdapter();
let lastEmittedModel = null;

// Source-backed extraction is enabled by default. Set the flag to false to pause it.
const SEARCH_KNOWLEDGE_PERSISTENCE_ENABLED = isSearchKnowledgePersistenceEnabled();

async function finishImmediateReply(reply, { memory, sessionId, taskId, requestId, requestStart }) {
    await memory.workingMemory.append({ role: 'assistant', content: reply }, sessionId);
    taskManager.endRequest(taskId);
    eventBus.emit(EventTypes.REQUEST_COMPLETED, {
        taskId,
        requestId,
        reply,
        timestamp: Date.now(),
        duration: Date.now() - requestStart
    });

    try {
        const cleanReply = prepareForTTS(responseProcessor.removeThinkingTraces(reply));
        if (cleanReply) ttsManager.enqueue(cleanReply, { requestId });
    } catch (error) {
        console.error('[TTS] Deterministic generation failed:', error.message);
    }

    return { reply, audio: null };
}

function scheduleMemoryExtraction({ userInput, memory, userMessageId, workingContext, sessionId, taskId, requestId }) {
    taskManager.createTask('memory_extraction', async () => {
        console.time("[MemoryExtraction_BG] Total Time");
        console.log("[MemoryExtraction_BG] Task started...");

        try {
            const { checkEligibility } = require('../memory/memoryEligibility');
            const eligibility = await checkEligibility(userInput);
            console.log('[MemoryEligibility DEBUG] Result:', eligibility);
            console.log('[MemoryEligibility DEBUG] Type:', typeof eligibility);
            console.log('[MemoryEligibility DEBUG] Module:', require.resolve('../memory/memoryEligibility'));
            console.log(`[MemoryEligibility] Score: ${eligibility.score} | Decision: ${eligibility.eligible ? 'EXTRACT' : 'SKIP'} | Reason: ${eligibility.reason}`);

            if (!eligibility.eligible) return null;

            const deterministic = require('../memory/deterministicExtractor');
            let extracted = await deterministic.extract(userInput);

            if (extracted.deterministic) {
                console.log('[MemoryExtraction_BG] Deterministic hit!');
                console.time("[MemoryExtraction_BG] Semantic Enrichment");
                extracted.memories = await semanticEnricher.enrichMemories(extracted.memories);
                console.timeEnd("[MemoryExtraction_BG] Semantic Enrichment");
            } else {
                console.time("[MemoryExtraction_BG] LLM Extraction");
                extracted = await memoryExtractor.extractMemory(userInput, workingContext);
                console.timeEnd("[MemoryExtraction_BG] LLM Extraction");
            }

            const extractedMemory = extracted.memories || [];
            const conversationUpdate = extracted.conversation_update || {};
            console.log(
                `[MemoryExtraction_BG] Extracted for "${userInput}":`,
                JSON.stringify(extractedMemory, null, 2)
            );

            console.time("[MemoryExtraction_BG] DB Save");
            const saveResult = await memoryManager.handleMemoryAction(extractedMemory);
            console.timeEnd("[MemoryExtraction_BG] DB Save");
            console.log('[MemoryExtraction_BG] Save Result:', saveResult.action);

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

            if (Object.keys(conversationUpdate).length > 0) {
                await sessionManager.mergeWorkingContext(sessionId, conversationUpdate);
                console.log('[MemoryExtraction_BG] Working Context delta merged.');
            }
        } catch (err) {
            console.error("[MemoryExtraction_BG] Failed:", err.message);
        } finally {
            console.timeEnd("[MemoryExtraction_BG] Total Time");
        }

        return null;
    }, taskId, requestId, 'NORMAL');
}

function handleMessage(userInput, options) {
    return require('../planner/state').runInSession(options.sessionId,
        () => handleSessionMessage(userInput, options));
}

async function handleSessionMessage(userInput, { memory, mode, sessionId, taskId, requestId, agentId }) {
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
        const agent = await getAgentProfile(agentId);
        const sessionScope = require('../planner/state');
        const codeEvidence = require('./codeEvidence');
        const priorCodeEvidence = codeEvidence.followUp(userInput, sessionScope.codeEvidence, agent.agentId);
        sessionScope.codeEvidence = priorCodeEvidence;
        console.log(`[AgentProfile] ${agent.agentId}: ${agent.source}, revision ${agent.revision ?? 'seed'}${agent.degraded ? ' (degraded)' : ''}`);
        const userMessageId = await memory.workingMemory.append({ role: 'user', content: userInput }, sessionId);

        // Phase 3C.2: Fetch rolling working context
        const workingContext = await sessionManager.getWorkingContext(sessionId);

        // 2. Planner Route
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'planner', timestamp: Date.now() });
        const plannerStart = Date.now();
        const toolResult = await planner.route(intent, userInput, history, taskId, requestId);
        sessionScope.codeEvidence = codeEvidence.capture(toolResult, agent.agentId)
            || (toolResult.needsTool ? null : priorCodeEvidence);
        const plannerDuration = Date.now() - plannerStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'planner', duration: plannerDuration, timestamp: Date.now() });

        const ranWebSearch = toolResult.needsTool && (
            toolResult.hasWebSearch === true ||
            toolResult.toolName === 'search_web' ||
            toolResult.toolName === 'webSearch'
        );

        // Coarse intent is derived from the route that actually won. Remote
        // Groq/Gemini preprocessing used to sit on every ambiguous turn's
        // critical path; free-tier retries/timeouts made a ~400ms context
        // build block for as long as 47 seconds. Automatic request handling
        // is now local/deterministic. Remote providers remain available
        // behind modelAdapter only when explicitly selected in the future.
        intent.intent = deriveIntentCategory({ toolResult });

        const reasoningDepth = reasoningController.getReasoningOptions(intent, null, userInput, modelRouter.getDefaultModel().model);
        const responseStyle = responseController.getResponseStyle(intent);

        let effectiveMode = mode;
        if (mode === 'auto' || !mode) {
            effectiveMode = personalityEngine.inferMode(intent);
        }

        if (toolResult.needsTool) {
            const failed = Number(toolResult.failedCount || 0) > 0 ||
                (typeof toolResult.toolResult === 'string' &&
                    (toolResult.toolResult.toLowerCase().includes('tool execution failed') ||
                        (ranWebSearch && !hasVerifiedSearchEvidence(
                            toolResult.searchEvidence || toolResult.toolResult
                        ))));
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, requestId, tool: toolResult.toolName, success: !failed, timestamp: Date.now() });
        } else {
            eventBus.emit(EventTypes.TOOL_COMPLETED, { taskId, requestId, tool: null, success: true, timestamp: Date.now() });
        }

        // Short-Circuit for Deterministic Tools & Background Tasks
        if (toolResult.shortCircuit) {
            const instantReply = formatImmediateToolReply(toolResult);
            return finishImmediateReply(instantReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        if (isToolInventoryRequest(userInput)) {
            console.log('[CapabilityInventory] Answered from executable contracts and permission policy.');
            return finishImmediateReply(formatToolInventory(), {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const modelChoice = modelRouter.getModelForTask(ranWebSearch ? 'search_web' : toolResult.toolName);
        const reasoning = { ...reasoningDepth, ...modelChoice };
        // Keep concise informational answers stable. Rich personality and
        // creative turns retain their existing sampling settings.
        if (effectiveMode !== 'creative' && personalityEngine.usesConciseProfile(agent.profile, { userInput, history })) {
            reasoning.temperature = 0;
        }
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

        const relevantMemory = await contextManager.getRelevantContext(
            userInput,
            history,
            intent,
            { sessionId }
        );
        const userNoteReply = resolveUserNoteReply(userInput);
        if (userNoteReply) {
            const contextDuration = Date.now() - contextStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });
            console.log('[GroundedAcknowledgement] Answered without model synthesis.');
            scheduleMemoryExtraction({
                userInput,
                memory,
                userMessageId,
                workingContext,
                sessionId,
                taskId,
                requestId
            });
            return finishImmediateReply(userNoteReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const operatingReply = resolveOperatingAnswer(userInput, {
            relevantMemory, toolResult, runtime: { tts: ttsManager.getStatus() }
        });
        if (operatingReply) {
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: Date.now() - contextStart, timestamp: Date.now() });
            console.log('[OperatingAnswer] Answered from the memory contract and runtime observation.');
            return finishImmediateReply(operatingReply, { memory, sessionId, taskId, requestId, requestStart });
        }

        const preferenceReply = resolvePreferenceComparison(userInput, relevantMemory, toolResult, agent.profile);
        if (preferenceReply) {
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: Date.now() - contextStart, timestamp: Date.now() });
            return finishImmediateReply(preferenceReply, { memory, sessionId, taskId, requestId, requestStart });
        }

        const implementationReply = resolveImplementationBoundaryReply(userInput, priorCodeEvidence && !toolResult.needsTool ? priorCodeEvidence : {
            toolName: toolResult.toolName,
            toolResult: toolResult.toolResult
        });
        if (implementationReply && !hasOperatingGuideAnswer(userInput)) {
            const contextDuration = Date.now() - contextStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });
            console.log('[GroundedImplementation] No verified implementation evidence was available.');
            scheduleMemoryExtraction({
                userInput,
                memory,
                userMessageId,
                workingContext,
                sessionId,
                taskId,
                requestId
            });
            return finishImmediateReply(implementationReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const trustedKnowledgeReply = resolveTrustedKnowledgeBoundaryReply(userInput, relevantMemory);
        if (trustedKnowledgeReply && !isKnowledgePipelineExplanation(userInput)) {
            const contextDuration = Date.now() - contextStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });
            const verifiedCount = Array.isArray(relevantMemory.knowledge)
                ? relevantMemory.knowledge.length
                : 0;
            console.log(
                verifiedCount > 0
                    ? `[GroundedKnowledge] Answered from ${verifiedCount} verified structured record${verifiedCount === 1 ? '' : 's'}.`
                    : '[GroundedKnowledge] No verified stored knowledge was available.'
            );
            scheduleMemoryExtraction({
                userInput,
                memory,
                userMessageId,
                workingContext,
                sessionId,
                taskId,
                requestId
            });
            return finishImmediateReply(trustedKnowledgeReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const knowledgeOverviewReply = selectTopics(userInput, history, intent).length === 0
            ? resolveKnowledgeOverviewReply(userInput, relevantMemory, toolResult) : null;
        if (knowledgeOverviewReply) {
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: Date.now() - contextStart, timestamp: Date.now() });
            console.log('[KnowledgeAnswerBoundary] Factual overview answered from checked records or an explicit evidence gap.');
            return finishImmediateReply(knowledgeOverviewReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const reflectionReply = resolveReflectionAnswer(userInput, relevantMemory);
        if (reflectionReply) {
            const contextDuration = Date.now() - contextStart;
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });
            console.log('[ReflectionRecall] Answered from structured reflection evidence.');
            return finishImmediateReply(reflectionReply, {
                memory, sessionId, taskId, requestId, requestStart
            });
        }

        const recallGap = resolveEmptyEventRecall(userInput, { relevantMemory, history, workingContext, toolResult });
        if (recallGap) {
            eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: Date.now() - contextStart, timestamp: Date.now() });
            console.log('[RecallAnswer] Event recall lacks sufficient support or history retrieval failed; no database-wide absence claim.');
            return finishImmediateReply(recallGap, { memory, sessionId, taskId, requestId, requestStart });
        }

        const context = await contextBuilder.buildContext({
            mode: effectiveMode,
            intent,
            responseStyle,
            memoryResult: { action: "deferred", message: "Processing in background" },
            toolResult,
            priorCodeEvidence: !toolResult.needsTool ? priorCodeEvidence : null,
            userInput,
            history,
            policy: reasoning.policy,
            workingContext,
            preprocessed: { relevantMemory },
            sessionId,
            capabilityRuntime: { model: modelChoice, tts: ttsManager.getStatus(), agentProfile: { agentId: agent.agentId, source: agent.source, revision: agent.revision } },
            agentProfile: agent.profile
        });
        const contextDuration = Date.now() - contextStart;
        eventBus.emit(EventTypes.STAGE_COMPLETED, { taskId, requestId, stage: 'context', duration: contextDuration, timestamp: Date.now() });

        const messages = [
            { role: 'system', content: context },
            ...[...history, { role: 'user', content: userInput }].slice(-4)
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

            // Qwen's thinking and answer share num_predict. Recover empty and
            // visibly truncated responses once with a larger budget.
            if (shouldRecoverResponse(reply, completionMeta)) {
                const wasTruncated = completionMeta?.doneReason === 'length';
                console.warn(
                    `[ResponseRecovery] ${requestId}: ${wasTruncated ? 'response truncated' : 'no visible content'}` +
                    `${completionMeta?.doneReason ? ` (done_reason=${completionMeta.doneReason}, evalCount=${completionMeta.evalCount})` : ''}; retrying once.`
                );
                const recoveryInstruction = wasTruncated && reply.trim()
                    ? `The prior generation was cut off mid-answer. Continue from exactly where this visible text ended without repeating it. Finish any cut-off word and complete the answer concisely.\n\nPARTIAL VISIBLE ANSWER:\n${reply}`
                    : 'The prior generation produced no visible answer. Answer the current user message now. Keep private reasoning focused and always complete the visible answer.';
                const recoveryMessages = [
                    {
                        role: 'system',
                        content: `${context}\n\nRECOVERY: ${recoveryInstruction}`
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
                const recoveryAppend = getRecoveryAppend(reply, recovered);
                if (recoveryAppend) emitContent(recoveryAppend);
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

        scheduleMemoryExtraction({
            userInput,
            memory,
            userMessageId,
            workingContext,
            sessionId,
            taskId,
            requestId
        });

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
                        query: toolResult.searchQuery || userInput,
                        summary: reply,
                        rawResults: toolResult.searchEvidence || toolResult.toolResult
                    });

                    console.log(
                        `[SearchKnowledgeExtraction_BG] Result:`,
                        extractionResult.saved > 0
                            ? `Saved ${extractionResult.saved} knowledge memories; ${extractionResult.queuedForReview || 0} queued for review.`
                            : extractionResult.queuedForReview > 0
                                ? `Queued ${extractionResult.queuedForReview} knowledge proposals for review; canonical claims unchanged.`
                                : extractionResult.duplicates > 0
                                    ? `Refreshed ${extractionResult.duplicates} existing knowledge memories.`
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
        const fallback = error.code === 'HISTORY_UNAVAILABLE'
            ? "I couldn't load this conversation's history, so I paused before answering or taking action. Please try again. This doesn't mean your saved history is empty."
            : "Something went wrong on my end processing that - try again?";
        eventBus.emit(EventTypes.REQUEST_FAILED, { taskId, requestId, error: error.message, timestamp: Date.now(), duration: Date.now() - requestStart });
        return { reply: fallback, audio: null };
    }
}

module.exports = { handleMessage };
