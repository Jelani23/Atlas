// backend/src/planner/planner.js
const { execute } = require('../tools/toolExecutor');
const llmRouter = require('./routing/llmRouter');
const permissionManager = require('../permissions/permissionManager');
const state = require('./state');

async function route(intent, message, history = [], taskId, requestId) {
    // 1. Conversational Confirmation State Machine (for voice UI)
    if (intent.winner === 'confirmation') {
        const isAffirmative = intent.params.isAffirmative;
        if (isAffirmative && state.pendingAction) {
            console.log(`[Planner] User approved pending action: ${state.pendingAction.intent}`);
            const { intent: pendingIntent, params } = state.pendingAction;
            state.pendingAction = null;
            try {
                const result = await execute(pendingIntent, params, { isApproved: true });
                return { needsTool: true, toolName: pendingIntent, toolResult: result, shortCircuit: true };
            } catch (err) {
                return { needsTool: true, toolName: pendingIntent, toolResult: `Error: ${err.message}`, shortCircuit: true };
            }
        } else if (!isAffirmative && state.pendingAction) {
            const denied = state.pendingAction.intent;
            state.pendingAction = null;
            return { needsTool: true, toolName: 'confirmation', toolResult: `Okay, I won't ${denied.replace(/([A-Z])/g, ' $1').toLowerCase()} that.`, shortCircuit: true };
        } else {
            return { needsTool: true, toolName: 'confirmation', toolResult: `I'm not sure what you're saying yes to. What would you like me to do?`, shortCircuit: true };
        }
    }

    // 2. Deterministic Fast-Path
    if (intent.state === 'DETERMINISTIC' && intent.winner) {
        console.log(`[Planner] Executing Deterministic Tool from Resolver: ${intent.winner}`);
        
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

    // 3. Ambiguity Short-Circuit
    if (intent.state === 'AMBIGUOUS') {
        return { 
            needsTool: true, 
            toolName: 'ask_clarification', 
            toolResult: `I'm not entirely sure what you mean. Could you clarify what you'd like me to do?`, 
            shortCircuit: true 
        };
    }

    // 4. LLM Path
    const isAffirmative = /\b(yes|yeah|yep|sure|do it|can you do so|please do|go ahead|check it|check for that)\b/i.test(message.toLowerCase().trim());
    if ((intent.state === 'UNKNOWN') && !isAffirmative) {
        const llmResult = await llmRouter.route(intent, message, history, taskId, requestId);
        if (llmResult) return llmResult;
    }

    return { needsTool: false };
}

module.exports = { route };