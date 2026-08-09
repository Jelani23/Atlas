// backend/src/tools/toolExecutor.js
const tools = require('./registry');
const permissionManager = require('../permissions/permissionManager');

// Update signature to accept options
async function execute(toolName, args = [], options = {}) {
    const permission = permissionManager.check(toolName);
    
    // If it requires approval, AND we haven't been told it's already approved, block it.
    if (permission.requiresApproval && !options.isApproved) {
        const approved = await permissionManager.request(toolName, args);
        if (!approved) {
            return `Error: Permission denied for ${toolName}.`;
        }
    } else if (!permission.allowed && !options.isApproved) {
        return `Error: ${toolName} is disabled. Reason: ${permission.reason}`;
    }
    
    if (typeof tools[toolName] !== 'function') {
        return `Error: Tool ${toolName} does not exist.`;
    }
    
    try {
        console.log(`[ToolExecutor] Executing ${toolName}...`);
        return await tools[toolName](...args);
    } catch (e) {
        console.error(`[ToolExecutor] Error executing ${toolName}:`, e);
        return `Error executing ${toolName}: ${e.message}`;
    }
}

module.exports = { execute };