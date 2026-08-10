// src/tools/memory/updateDevState.js
const devState = require('../../memory/devState');

async function updateDevState(feature, status) {
    try {
        if (!feature || !status) return "Error: I need both a feature name and a status (e.g., implemented, planned, in development).";
        const result = await devState.updateFeature(feature, status);
        if (result.updated) return `Got it, I've updated "${result.feature}" in the dev state to ${result.status}.`;
        return `Okay, I've added "${result.feature}" to the dev state as ${result.status}.`;
    } catch (error) {
        return `Error updating dev state: ${error.message}`;
    }
}

module.exports = {
    execute: updateDevState,
    intentSchema: {
        name: 'updateDevState',
        domain: 'MEMORY',
        triggers: ['mark', 'update feature', 'dev state', 'add to dev state', 'add to the dev state'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Added "in development" to the regex
            let m = message.match(/(?:mark|update feature|add)\s+(?:the\s+)?(.+?)\s+(?:as|to the dev state as|to dev state as)\s+(implemented|planned|in progress|in development|in_progress)/i);
            
            if (m) {
                let status = m[2].toLowerCase().replace('_', ' ');
                if (status === 'in development' || status === 'in progress') status = 'in_progress';
                return [m[1].trim(), status];
            }
            return [null, null];
        }
    }
};