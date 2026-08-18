// backend/src/planner/planner.js
const { execute } = require('../tools/toolExecutor');
const llmRouter = require('./routing/llmRouter');
const permissionManager = require('../permissions/permissionManager');
const state = require('./state');

async function route(intent, message, history = [], taskId, requestId) {
    // 0. Systemic Permission & Confirmation Boundary
    // Intercept Yes/No at the very top to resolve pending permissions or actions.
    const lowerMessage = message.toLowerCase().trim();
    const isAffirmative = /\b(yes|yeah|yep|sure|do it|can you do so|please do|go ahead|check it|check for that)\b/i.test(lowerMessage);
    const isNegative = /\b(no|nope|cancel|stop|don't|do not)\b/i.test(lowerMessage);

    if (isAffirmative || isNegative) {
        // Check for pending LLM tool permissions
        if (permissionManager.handlePermissionResponse(message)) {
            return { 
                needsTool: true, 
                toolName: 'confirmation', 
                toolResult: "Permission resolved.", 
                shortCircuit: true 
            };
        }
        
        // Check for pending deterministic tool confirmations
        if (state.pendingAction) {
            if (isAffirmative) {
                console.log(`[Planner] User approved pending action: ${state.pendingAction.intent}`);
                const { intent: pendingIntent, params } = state.pendingAction;
                state.pendingAction = null;
                try {
                    const result = await execute(pendingIntent, params, { isApproved: true });
                    return { needsTool: true, toolName: pendingIntent, toolResult: result, shortCircuit: true };
                } catch (err) {
                    return { needsTool: true, toolName: pendingIntent, toolResult: `Error: ${err.message}`, shortCircuit: true };
                }
            } else {
                const denied = state.pendingAction.intent;
                state.pendingAction = null;
                return { needsTool: true, toolName: 'confirmation', toolResult: `Okay, I won't ${denied.replace(/([A-Z])/g, ' $1').toLowerCase()} that.`, shortCircuit: true };
            }
        }
    }

    // 1. Deterministic Fast-Path
    if (intent.state === 'DETERMINISTIC' && intent.winner) {
        console.log(`[Planner] Executing Deterministic Tool from Resolver: ${intent.winner}`);

        // Phase: webSearch winning here used to fall straight into the
        // generic execute()+shortCircuit branch below - a single raw tool
        // call with the LLM-stripped query, returned verbatim as the reply.
        // That skipped the entire search pipeline (3-query generation,
        // synthesis into one answer) AND, because shortCircuit=true makes
        // conversationEngine.js return before it ever reaches the
        // background-task section, skipped memory extraction and
        // search-knowledge extraction too. The intent resolver is still the
        // one deciding "yes, this message is a search" - fast and
        // deterministic, no LLM call needed for that part - it just now
        // hands off to the real pipeline instead of bypassing it, and does
        // NOT short-circuit, so the normal LLM-synthesis and background
        // extraction stages still run exactly as they do for any other
        // search.
        if (intent.winner === 'webSearch') {
            const searchPipeline = require('./searchPipeline');
            const queries = await searchPipeline.generateQueries(message);
            const toolResult = await searchPipeline.executeSearch(queries);
            state.lastSearchQuery = queries[0];
            return { needsTool: true, toolName: 'search_web', toolResult };
        }

        if (intent.winner !== 'confirmation') {
            const permCheck = permissionManager.check(intent.winner);
            if (permCheck.requiresApproval) {
                console.log(`[Planner] Permission required for ${intent.winner}. Deferring to conversational flow.`);
                state.pendingAction = { intent: intent.winner, params: intent.params };
                const targetName = intent.params[0] || 'this file';
                return { 
                    needsTool: true, 
                    toolName: 'permission_request', 
                    toolResult: `PERMISSION REQUIRED: Just to confirm, you want me to ${intent.winner.replace(/([A-Z])/g, ' $1').toLowerCase()} ${targetName}?`, 
                    shortCircuit: true 
                };
            }
        }

        try {
            const toolResult = await execute(intent.winner, intent.params || []);
            return { needsTool: true, toolName: intent.winner, toolResult, shortCircuit: true };
        } catch (err) {
            console.error(`[Planner] Tool execution failed for ${intent.winner}:`, err.message);
        }
    }

    // 2. Ambiguity Short-Circuit
    if (intent.state === 'AMBIGUOUS') {
        return { 
            needsTool: true, 
            toolName: 'ask_clarification', 
            toolResult: `I'm not entirely sure what you mean. Could you clarify what you'd like me to do?`, 
            shortCircuit: true 
        };
    }

    // 3. LLM Path
    if ((intent.state === 'UNKNOWN') && !isAffirmative) {
        const llmResult = await llmRouter.route(intent, message, history, taskId, requestId);
        if (llmResult) return llmResult;
    }

    return { needsTool: false };
}

module.exports = { route };