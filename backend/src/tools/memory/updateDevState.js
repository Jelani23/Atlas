// src/tools/memory/updateDevState.js
const devState = require('../../memory/devState');

async function updateDevState(feature, status) {
    try {
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
            // Try matching "Mark X as Y" or "Update feature X as Y"
            let m = message.match(/(?:mark|update feature)\s+(?:the\s+)?(.+?)\s+(?:as|in the dev state as)\s+(implemented|planned|in progress|in_progress)/i);
            
            // If no match, try matching "Add X to the dev state as Y"
            if (!m) {
                m = message.match(/(?:add)\s+(.+?)\s+(?:to the dev state as|to dev state as)\s+(implemented|planned|in progress|in_progress)/i);
            }

            if (m) {
                let status = m[2].toLowerCase().replace('_', ' ');
                if (status === 'in progress') status = 'in_progress';
                return [m[1].trim(), status];
            }
            return [null, null];
        }
    }
};