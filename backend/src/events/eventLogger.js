// backend/src/events/eventLogger.js
const { eventBus } = require('./eventBus');
const EventTypes = require('./eventTypes');

const activeRequests = new Map();

function initialize() {
    console.log('[EventLogger] Initializing telemetry logger...');

    eventBus.on(EventTypes.REQUEST_STARTED, (payload) => {
        activeRequests.set(payload.requestId, {
            requestId: payload.requestId,
            taskId: payload.taskId,
            text: payload.text,
            startTime: payload.timestamp,
            stages: {},
            llm: { 
                required: false, 
                reason: null, 
                firstTokenTime: null, 
                firstContentTime: null, 
                totalLlmTime: 0, 
                thinkingTokens: 0, 
                contentTokens: 0, 
                metrics: null 
            },
            tool: { name: null, success: true },
            cache: { hits: 0, misses: 0 }
        });
    });

    eventBus.on(EventTypes.STAGE_COMPLETED, ({ requestId, stage, duration }) => {
        const req = activeRequests.get(requestId);
        if (req) {
            req.stages[stage] = duration;
            if (stage === 'llm') req.llm.totalLlmTime = duration;
        }
    });

    eventBus.on(EventTypes.TOOL_COMPLETED, ({ requestId, tool, success }) => {
        const req = activeRequests.get(requestId);
        if (req) {
            req.tool.name = tool;
            req.tool.success = success;
        }
    });

    eventBus.on(EventTypes.MODEL_SELECTED, ({ requestId, model, reason }) => {
        const req = activeRequests.get(requestId);
        if (req) {
            req.llm.required = true;
            req.llm.model = model;
            req.llm.reason = reason;
        }
    });

    eventBus.on(EventTypes.LLM_FIRST_TOKEN, ({ requestId, llmStart, timestamp }) => {
        const req = activeRequests.get(requestId);
        if (req && !req.llm.firstTokenTime) {
            req.llm.firstTokenTime = timestamp - llmStart; // True LLM TTFT
        }
    });

    eventBus.on(EventTypes.LLM_FIRST_CONTENT, ({ requestId, llmStart, timestamp }) => {
        const req = activeRequests.get(requestId);
        if (req && !req.llm.firstContentTime) {
            req.llm.firstContentTime = timestamp - llmStart; // True LLM TTFC
        }
    });

    eventBus.on(EventTypes.LLM_TOKEN_STREAM, ({ requestId, token, tokenType }) => {
        const req = activeRequests.get(requestId);
        if (req) {
            const tokenCount = Math.ceil(token.length / 4);
            if (tokenType === 'thinking') {
                req.llm.thinkingTokens += tokenCount;
            } else {
                req.llm.contentTokens += tokenCount;
            }
        }
    });

    eventBus.on(EventTypes.LLM_METRICS, ({ requestId, ...metrics }) => {
        const req = activeRequests.get(requestId);
        if (req && req.llm.required && !req.llm.metrics) {
            req.llm.metrics = metrics;
        }
    });

    eventBus.on(EventTypes.REQUEST_COMPLETED, ({ requestId, duration }) => {
        printSnapshot(requestId, duration, false);
    });

    eventBus.on(EventTypes.REQUEST_FAILED, ({ requestId, duration, error }) => {
        printSnapshot(requestId, duration, true, error);
    });
}

function printSnapshot(requestId, totalDuration, failed, errorMsg = null) {
    const req = activeRequests.get(requestId);
    if (!req) return;

    console.log('\n=========================================');
    console.log('📊 PERFORMANCE SNAPSHOT');
    console.log('=========================================');
    console.log(`Request: "${req.text.substring(0, 50)}..."`);
    console.log(`Route:   ${req.tool.name ? `Tool: ${req.tool.name}` : 'LLM Response'}`);
    
    console.log('\nAtlas Pipeline (ms):');
    console.log(`  Intent:    ${req.stages.intent || 0}ms`);
    console.log(`  Planner:   ${req.stages.planner || 0}ms`);
    console.log(`  Context:   ${req.stages.context || 0}ms`);

    if (req.llm.required) {
        console.log('\nOllama Metrics:');
        if (req.llm.metrics) {
            const m = req.llm.metrics;
            console.log(`  Load:        ${m.loadDuration}ms`);
            console.log(`  Prompt Eval: ${m.promptEvalDuration}ms (${m.promptEvalCount} tokens)`);
            console.log(`  TTFT:        ${req.llm.firstTokenTime || 0}ms`);
            console.log(`  TTFC:        ${req.llm.firstContentTime || 0}ms`);
            console.log(`  Generation:  ${m.evalDuration}ms (${m.evalCount} tokens)`);
            
            const promptTokS = m.promptEvalDuration > 0 ? (m.promptEvalCount / (m.promptEvalDuration / 1000)).toFixed(1) : '0';
            const genTokS = m.evalDuration > 0 ? (m.evalCount / (m.evalDuration / 1000)).toFixed(1) : '0';
            console.log(`  Speed:       Prompt ${promptTokS} tok/s | Gen ${genTokS} tok/s`);
            console.log(`  Tokens:      Thinking: ${req.llm.thinkingTokens} | Content: ${req.llm.contentTokens}`);
        } else {
            console.log('  (Metrics not received)');
        }
    }

    console.log(`\nTOTAL:     ${totalDuration}ms`);

    if (failed) {
        console.log(`❌ STATUS: FAILED - ${errorMsg}`);
    } else {
        console.log(`✅ STATUS: SUCCESS`);
    }
    console.log('=========================================\n');

    activeRequests.delete(requestId);
}

module.exports = { initialize };