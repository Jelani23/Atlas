// backend/src/permissions/permissionManager.js
const EventEmitter = require('events');
const { POLICY } = require('./permissionPolicy');
const { confirmationDecision } = require('../intent/toolRequestBoundary');

class PermissionManager extends EventEmitter {
    constructor() {
        super();
        this.pendingRequests = new Map();
    }

    /**
     * Checks if a tool is allowed to execute automatically.
     * @returns {object} { allowed, requiresApproval, risk, reason }
     */
    check(toolName) {
        const policy = POLICY[toolName];
        
        if (!policy) {
            // Fail safe: unknown tools require approval
            return { allowed: false, requiresApproval: true, risk: 'CRITICAL', reason: 'Unknown tool, approval required by default.' };
        }

        if (policy.default === 'allow') {
            return { allowed: true, requiresApproval: false, risk: policy.risk };
        } else if (policy.default === 'approval') {
            return { allowed: false, requiresApproval: true, risk: policy.risk, reason: `Tool ${toolName} is classified as ${policy.risk} risk and requires approval.` };
        } else {
            return { allowed: false, requiresApproval: false, risk: policy.risk, reason: `Tool ${toolName} is strictly denied.` };
        }
    }

    /**
     * Creates a pending approval request and emits an event for the UI to catch.
     * @returns {Promise<boolean>} Resolves true if approved, false if denied.
     */
    request(toolName, args) {
        return new Promise((resolve) => {
            const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            this.pendingRequests.set(id, { toolName, args, resolve });
            
            console.log(`[Permission] Requesting approval for ${toolName} (ID: ${id})`);
            this.emit('permission.requested', { id, toolName, args });
        });
    }

    /**
     * Resolves a pending approval request.
     * @param {string} id - The request ID
     * @param {boolean} decision - True if approved, false if denied
     */
    /**
     * Checks if there are any pending approval requests.
     * Used by the intent resolver to decide if a 'yes'/'no' is a confirmation.
     */
    handlePermissionResponse(message) {
        if (this.pendingRequests.size === 0) return false;

        const decision = confirmationDecision(message);
        if (decision !== null) {
            // Get the oldest pending request
            const [id, request] = this.pendingRequests.entries().next().value;
            console.log(`[Permission] Message "${message}" interpreted as ${decision ? 'APPROVE' : 'DENY'} for ${request.toolName} (ID: ${id})`);
            this.resolve(id, decision);
            return true;
        }

        return false;
    }

    resolve(id, decision) {
        if (this.pendingRequests.has(id)) {
            console.log(`[Permission] Request ${id} ${decision ? 'APPROVED' : 'DENIED'}.`);
            const { resolve: resolver } = this.pendingRequests.get(id);
            this.pendingRequests.delete(id);
            resolver(decision);
        } else {
            console.warn(`[Permission] Received resolution for unknown ID: ${id}`);
        }
    }
}

module.exports = new PermissionManager();
