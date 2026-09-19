// backend/src/tools/toolExecutor.js
const tools = require('./');
const permissionManager = require('../permissions/permissionManager');

async function execute(toolName, args = [], options = {}) {
    const state = require('../planner/state');
    if (state.isSessionClosed()) return 'Error: The originating conversation is closed.';
    const permission = permissionManager.check(toolName);
    // Approval applies to approval-gated tools, never to a policy prohibition.
    if (!permission.allowed && !permission.requiresApproval) {
        return `Error: ${toolName} is disabled. Reason: ${permission.reason}`;
    }
    
    // If it requires approval, AND we haven't been told it's already approved, block it.
    if (permission.requiresApproval && !options.isApproved) {
        const approved = await permissionManager.request(toolName, args);
        if (!approved) {
            return `Error: Permission denied for ${toolName}.`;
        }
    }
    
    if (state.isSessionClosed()) return 'Error: The originating conversation is closed.';
    const toolExport = tools[toolName];
    if (!toolExport) {
        return `Error: Tool ${toolName} does not exist.`;
    }

    // Support both new { execute } format and old single-function format
    const toolFunction = typeof toolExport === 'object' ? toolExport.execute : toolExport;
    if (typeof toolFunction !== 'function') {
        return `Error: Tool ${toolName} is invalid.`;
    }
    
    try {
        console.log(`[ToolExecutor] Executing ${toolName}...`);
        
        // If args is an array (from the new Intent Resolver), spread it directly
        if (toolName !== 'readCode' && args.length === 1 && Array.isArray(args[0])) {
            return await toolFunction(...args[0]);
        }
        
        return await toolFunction(...args);
    } catch (e) {
        console.error(`[ToolExecutor] Error executing ${toolName}:`, e);
        return `Error executing ${toolName}: ${e.message}`;
    }
}

module.exports = { execute };
