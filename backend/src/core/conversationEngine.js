// backend/src/core/conversationEngine.js
const { createModelAdapter } = require('../models/modelAdapter');
const modelRouter = require('../models/modelRouter');
const planner = require('../planner/planner');
const memoryExtractor = require('../memory/memoryExtractor');
const semanticEnricher = require('../memory/semanticEnricher');
const reasoningController = require('../reasoning/controller');
const { resolve } = require('../intent/intentResolver');
const { deriveIntentCategory } = require('../intent/intentCategory');
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
const preprocessingLayer = require('../preprocessing/preprocessingLayer');

const modelAdapter = createModelAdapter();
const geminiAdapter = createModelAdapter('gemini');
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

        const ranWebSearch = toolResult.needsTool &&
            (toolResult.toolName === 'search_web' || toolResult.toolName === 'webSearch');

        // Phase: getResponseStyle/getReasoningOptions/inferMode (and
        // contextBuilder's own "is this memory/search-relevant" checks)
        // all branch on `intent.intent` being a coarse category string
        // ('search'/'coding'/'planning'/'memory'/'action'/'conversation').
        // intentResolver.resolve() never sets that field - it returns
        // {state, winner, params, ...}, not {intent: '...'} - so every one
        // of those switches was silently falling through to its default
        // case on every message. intentCategory.js now derives the real
        // category from the tool that actually won routing.
        //
        // The Groq semantic stage is also run HERE - before reasoningDepth/
        // responseStyle are computed - rather than later inside
        // preprocessingLayer's full runPreprocessing() (which still runs
        // afterward for the Gemini contextual stage). Previously the whole
        // preprocessing layer ran only after these two decisions were
        // already locked in, which meant Groq's read of the request could
        // never actually influence how hard Qwen thinks or how the
        // response is shaped - it could only annotate context text Qwen
        // may or may not read. Running the semantic half early, and
        // reusing its result via `overrides.semanticStage` below instead
        // of calling Groq a second time, is what lets deriveIntentCategory
        // and reasoningController actually use it.
        const semanticStage = await preprocessingLayer.runSemanticStage({
            userInput,
            intent,
            history,
            toolResult
        });

        intent.intent = deriveIntentCategory({ toolResult, semanticProfile: semanticStage.semantic });

        const reasoningDepth = reasoningController.getReasoningOptions(intent, semanticStage.semantic);
        const responseStyle = responseController.getResponseStyle(intent);

        let effectiveMode = mode;
        if (mode === 'auto' || !mode) {
            effectiveMode = personalityEngine.inferMode(intent);
        }

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

        // Provider-aware adapter selection: tasks routed to Gemini (web
        // search synthesis) stream through the Gemini provider. Falls back
        // to the default provider whenever GEMINI_API_KEY is missing, so a
        // missing credential never breaks search.
        const llmAdapter = (reasoning.provider === 'gemini' && process.env.GEMINI_API_KEY)
            ? geminiAdapter
            : modelAdapter;
        
        // Phase 8B: LLM Call Attribution
        const llmReason = toolResult.needsTool && !toolResult.shortCircuit 
            ? 'tool_interpretation' 
            : 'response_generation';
            
        eventBus.emit(EventTypes.MODEL_SELECTED, { taskId, requestId, model: reasoning.model, reason: llmReason, timestamp: Date.now() });

        // 3. Build Context
        eventBus.emit(EventTypes.STAGE_STARTED, { taskId, requestId, stage: 'context', timestamp: Date.now() });
        const contextStart = Date.now();

        // Phase: Optional pre-contextualization layer (Groq semantic /
        // Gemini contextual). Sits between deterministic/router processing
        // and final context assembly. Fully optional and never throws -
        // any failure falls back to the existing Qwen pipeline unchanged.
        // Groq already ran above (semanticStage) - passed through via
        // overrides so this only runs the Gemini contextual half.
        const preprocessed = await preprocessingLayer.runPreprocessing({
            userInput,
            intent,
            history,
            toolResult,
            workingContext,
            overrides: { semanticStage }
        });

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
            preprocessed
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

        // Phase (TTS/UI leak fix): full-stream reasoning filter.
        //
        // Ollama's `think` API cleanly separates dedicated reasoning tokens
        // into their own `thinking` channel (handled below via
        // chunk.type === 'thinking', which never touches `reply` or TTS),
        // but qwen3 doesn't reliably use that channel - it can write its
        // entire reasoning block straight into the regular `content`
        // channel, wrapped in <think>...</think> (or, per Ollama's own
        // notes, sometimes with only a stray closing tag and no opener).
        // Confirmed from the performance snapshot logs: "Thinking: 0 |
        // Content: 364" - the model put 100% of its output, reasoning
        // included, on the content channel.
        //
        // The previous version only filtered a capped LEADING buffer (until
        // the first sentence boundary, or 500 chars) and then trusted every
        // later chunk as safe. That's wrong whenever the reasoning trace is
        // longer than one sentence, which it almost always is - everything
        // after the first sentence streamed straight to the UI and into
        // TTS unfiltered, including the literal "</think>" tag itself once
        // it finally arrived.
        //
        // Fix: track think-tag state across the WHOLE stream, not just the
        // start. Content is held back for as long as we're inside a think
        // block (or haven't yet ruled one out), and only starts flowing
        // through - to `reply`, the UI stream, and TTS - once we're
        // confirmed past it.
        let thinkFilterState = 'unresolved'; // 'unresolved' | 'inside' | 'outside'
        let pendingThinkBuffer = '';
        const OPEN_TAG = '<think>';
        const CLOSE_TAG = '</think>';

        // Phase (delimiter fix): the tag- and internal-marker-based checks
        // below only catch narration that either uses <think> tags or
        // echoes contextBuilder.js's own section-header strings by name.
        // Neither one catches free-form scratchpad narration in a
        // different style - confirmed from a live bug report where the
        // model, given a bigger token budget, filled it with stage
        // directions about how to phrase the reply ("Use emojis if
        // appropriate... Avoid mentioning the database... Wait, the user
        // might not care...") with no tag and no echoed section name
        // anywhere in it. That went straight through unfiltered and got
        // shown/spoken verbatim, cut off mid-sentence at the token cap.
        // Trying to enumerate every possible narration style the model
        // might invent is a losing game (already acknowledged in an
        // earlier pass) - the actual fix is structural: stop guessing
        // where narration ends, and instead give the model an explicit,
        // app-defined delimiter to mark where its real answer starts (see
        // the OUTPUT DISCIPLINE section in personalityEngine.js, which
        // instructs the model to always write this exact line
        // immediately before its answer). Whatever comes before this
        // marker - tagged, untagged, any style - gets discarded; whatever
        // comes after is trusted content, unconditionally. This is checked
        // FIRST, ahead of the tag/marker checks, since it should reliably
        // fire even when the model's narration doesn't match either of
        // the other two signals.
        const FINAL_MARKER = 'final response:';
        const findFinalMarker = (str) => str.toLowerCase().indexOf(FINAL_MARKER);

        // Phase (untagged-narration fix): the two tag-based checks above
        // only catch reasoning that's wrapped in <think>...</think> (or has
        // a stray closer). But this model sometimes reasons WITHOUT any
        // tag at all - see the "What do you remember about me?" /
        // "What project are we working on?" bug reports: the model just
        // talks through its own context out loud, no tags anywhere in the
        // whole ~400-token generation, so neither branch above ever fires
        // and the untagged narration used to sail straight through as if
        // it were the real answer.
        //
        // The narration in those cases wasn't generic "let me think about
        // this" filler - it was the model literally reading its own system
        // prompt's internal section labels back ("In the ALICE MEMORY
        // CONTEXT section...", "In the ATLAS OS HOT CONTEXT section...").
        // Those exact strings only exist in contextBuilder.js's own prompt
        // scaffolding (see the grep-confirmed literal headers below) - a
        // genuine answer to the user would never naturally contain them.
        // That makes this a highly reliable, Atlas-specific signal, unlike
        // generic English reasoning-phrase matching (which is a losing
        // whack-a-mole game against an open-ended model) - kept as a
        // second-line signal alongside the new delimiter above, since a
        // model that isn't yet reliably using the delimiter might still
        // exhibit this specific pattern.
        //
        // Treated exactly like finding an OPEN_TAG: transition to 'inside'
        // and buffer until a real </think> (or FINAL_MARKER) shows up, or
        // the stream ends (in which case the existing 'inside'-at-end-of-
        // stream handling below correctly drops it and lets the
        // empty-reply fallback take over, rather than reading raw
        // prompt-structure narration aloud).
        const INTERNAL_NARRATION_MARKERS = [
            'ALICE MEMORY CONTEXT', 'ATLAS OS HOT CONTEXT', 'END HOT CONTEXT',
            'ATLAS OS DEVELOPMENT STATE', 'ATLAS OS WORLD MODEL', 'END WORLD MODEL',
            'ATLAS OS OPERATIONAL HEURISTICS', 'END MEMORY CONTEXT'
        ];
        const findNarrationMarker = (str) => {
            const upper = str.toUpperCase();
            for (const marker of INTERNAL_NARRATION_MARKERS) {
                const idx = upper.indexOf(marker);
                if (idx !== -1) return idx;
            }
            return -1;
        };

        // True if the buffer ends mid-tag (e.g. "...</thi"), so scanning
        // now would split a tag across a chunk boundary and let half of it
        // leak through unrecognized.
        const endsWithPartialTag = (str) => /<\/?t(h(i(n(k)?)?)?)?$/i.test(str);

        // Consumes one chunk of raw content and returns only the portion
        // that's safe to emit right now (may be '').
        const filterThinking = (text) => {
            if (thinkFilterState === 'outside') return text;
            pendingThinkBuffer += text;

            if (thinkFilterState === 'unresolved') {
                const finalIdx = findFinalMarker(pendingThinkBuffer);
                if (finalIdx !== -1) {
                    // Explicit app-defined delimiter found - trust it
                    // unconditionally, regardless of whether anything
                    // before it looked like reasoning by any other signal.
                    const after = pendingThinkBuffer.slice(finalIdx + FINAL_MARKER.length);
                    console.log(`[ThinkFilter] ${requestId}: found "Final response:" delimiter - discarded ${finalIdx + FINAL_MARKER.length} chars before it, trusting everything after.`);
                    pendingThinkBuffer = '';
                    thinkFilterState = 'outside';
                    return after;
                }
                const closeIdx = pendingThinkBuffer.indexOf(CLOSE_TAG);
                if (closeIdx !== -1) {
                    // Paired <think>...</think>, or a stray opener-less
                    // closer - either way, everything up to and including
                    // the closer is reasoning. Discard it; whatever
                    // follows is real content.
                    const after = pendingThinkBuffer.slice(closeIdx + CLOSE_TAG.length);
                    console.log(`[ThinkFilter] ${requestId}: found stray </think> with no prior <think> - discarded ${closeIdx + CLOSE_TAG.length} chars of leaked reasoning.`);
                    pendingThinkBuffer = '';
                    thinkFilterState = 'outside';
                    return after;
                }
                const openIdx = pendingThinkBuffer.indexOf(OPEN_TAG);
                if (openIdx !== -1) {
                    // Confirmed inside a think block - keep buffering
                    // (emit nothing) until the matching close arrives,
                    // however long that takes. Nothing before/at the
                    // opener was real content either.
                    console.log(`[ThinkFilter] ${requestId}: <think> opened - buffering until </think>.`);
                    pendingThinkBuffer = pendingThinkBuffer.slice(openIdx + OPEN_TAG.length);
                    thinkFilterState = 'inside';
                    return '';
                }
                const markerIdx = findNarrationMarker(pendingThinkBuffer);
                if (markerIdx !== -1) {
                    // No <think> tag, but the model is narrating its own
                    // prompt structure by name - just as reliable a signal
                    // that this isn't a real answer. Discard everything up
                    // to the marker too (it's narration lead-in, e.g. "In
                    // the") and keep buffering from there, same as 'inside'.
                    console.log(`[ThinkFilter] ${requestId}: detected untagged narration referencing internal prompt structure - treating as reasoning, buffering.`);
                    pendingThinkBuffer = pendingThinkBuffer.slice(markerIdx);
                    thinkFilterState = 'inside';
                    return '';
                }
                if (endsWithPartialTag(pendingThinkBuffer)) {
                    return ''; // might be mid-tag, wait for the rest
                }
                // Phase (root-cause fix): this used to give up after
                // UNRESOLVED_CAP (500) chars with no tag sighting and
                // flush the buffer as "not reasoning after all" - but for
                // this model, a stray opener-less </think> routinely shows
                // up much later than 500 chars into the reasoning trace
                // (confirmed from three separate bug reports: the first
                // TTS chunk each time is roughly the first ~500 chars of
                // reasoning prose, immediately followed by the rest of the
                // reasoning streaming through raw once this branch flipped
                // the filter to 'outside'). There is no safe text-based
                // way to distinguish "long non-reasoning reply" from
                // "reasoning that hasn't hit </think> yet" early - only
                // events can ever resolve that: finding a tag, finding an
                // internal-structure marker, or the stream actually ending
                // (handled below, after the loop). So: no cap here. Keep
                // holding, no matter how long, until one of those happens.
                // This costs the live-typing UX effect for a genuinely
                // long reply that never reasons at all (it now buffers
                // fully before showing anything) - a deliberate trade for
                // correctness, since every observed generation on this
                // deployment reasons inline.
                return '';
            }

            // thinkFilterState === 'inside'
            const finalIdxInside = findFinalMarker(pendingThinkBuffer);
            if (finalIdxInside !== -1) {
                const after = pendingThinkBuffer.slice(finalIdxInside + FINAL_MARKER.length);
                console.log(`[ThinkFilter] ${requestId}: found "Final response:" delimiter while inside a reasoning block - resuming normal streaming from there.`);
                pendingThinkBuffer = '';
                thinkFilterState = 'outside';
                return after;
            }
            const closeIdx = pendingThinkBuffer.indexOf(CLOSE_TAG);
            if (closeIdx !== -1) {
                const after = pendingThinkBuffer.slice(closeIdx + CLOSE_TAG.length);
                console.log(`[ThinkFilter] ${requestId}: </think> found - reasoning block closed, resuming normal streaming.`);
                pendingThinkBuffer = '';
                thinkFilterState = 'outside';
                return after;
            }
            // Still inside reasoning - keep buffering silently. No cap
            // here (the 'unresolved' cap above already ruled out "this
            // isn't reasoning at all" before we got here); reasoning
            // traces can legitimately run long. Just prevent unbounded
            // growth for a pathological reply that never closes the tag.
            if (pendingThinkBuffer.length > 20000) {
                pendingThinkBuffer = pendingThinkBuffer.slice(-2000);
            }
            return '';
        };

        // Emits already-decided-safe text exactly the way raw content used
        // to be emitted: appended to `reply`, streamed to the UI, and fed
        // into the TTS sentence buffer.
        const emitContent = (text) => {
            if (!text) return;
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
                        if (!firstContentEmitted) {
                            firstContentEmitted = true;
                            eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
                        }

                        const safeText = filterThinking(chunk.text);
                        if (safeText) emitContent(safeText);
                    }
                }

                // Stream ended before the filter ever definitively resolved.
                // Two different cases land here, and they need different
                // handling:
                //
                //   'unresolved' - no think tag (open or close) ever
                //   appeared anywhere in the entire reply. Since the cap-
                //   based early bailout above was removed (it was
                //   misfiring on this model's reasoning traces, which
                //   routinely run past 500 chars before any tag shows up -
                //   see the comment above), reaching stream end still in
                //   'unresolved' now unambiguously means this reply never
                //   contained any reasoning markup at all. Flush it, it's
                //   real content.
                //
                //   'inside' - the model opened a think block and the
                //   stream ended without ever emitting a closing tag (e.g.
                //   generation got cut off by maxTokens mid-reasoning,
                //   before ever producing a real answer). There is no
                //   reliable way to strip this - removeThinkingTraces()
                //   only knows how to remove text up to a closing tag it
                //   can actually find, so calling it here on text with NO
                //   closing tag is a no-op and would push the raw
                //   reasoning straight through as if it were the answer.
                //   Drop it instead. If nothing else was ever emitted this
                //   turn, `reply` stays empty and the existing "I
                //   generated a response but it came back empty..."
                //   fallback a few lines below handles it correctly - a
                //   generic fallback message is the right outcome here,
                //   not raw reasoning shown as if it were a response.
                if (thinkFilterState === 'unresolved' && pendingThinkBuffer) {
                    const flushed = pendingThinkBuffer;
                    pendingThinkBuffer = '';
                    emitContent(flushed);
                } else if (thinkFilterState === 'inside' && pendingThinkBuffer) {
                    console.log(`[ThinkFilter] ${requestId}: stream ended mid-<think> block with no closing tag - dropping ${pendingThinkBuffer.length} chars of unterminated reasoning instead of showing it as the answer.`);
                    pendingThinkBuffer = '';
                }
            } else {
                reply = await llmAdapter.complete(messages, { ...reasoning, requestId });
                eventBus.emit(EventTypes.LLM_FIRST_TOKEN, { taskId, requestId, llmStart, timestamp: Date.now() });
                eventBus.emit(EventTypes.LLM_FIRST_CONTENT, { taskId, requestId, llmStart, timestamp: Date.now() });
                
                // If non-streaming, just enqueue the whole reply - but only
                // after stripping thinking traces first. This used to call
                // ttsManager.enqueue(reply, ...) with the raw model output,
                // while the removeThinkingTraces() pass a few lines below
                // only reassigned the local `reply` variable - the TTS
                // queue had already been handed the unfiltered text by
                // then, so a non-streamed reply could speak its reasoning
                // the same way the streaming path could.
                const ttsManager = require('../voice/tts/ttsManager.js');
                const cleanedForTts = prepareForTTS(responseProcessor.removeThinkingTraces(reply));
                ttsManager.enqueue(cleanedForTts, { requestId });
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
        if (ranWebSearch) {
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