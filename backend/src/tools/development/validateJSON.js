// src/tools/development/validateJSON.js
async function validateJSON(jsonString) {
    try {
        if (!jsonString) return "Error: No JSON string provided.";
        const parsed = JSON.parse(jsonString);
        return `Valid JSON. Parsed object:\n${JSON.stringify(parsed, null, 2)}`;
    } catch (error) {
        return `Invalid JSON: ${error.message}`;
    }
}

module.exports = {
    execute: validateJSON,
    intentSchema: {
        name: 'validateJSON',
        domain: 'FILES',
        triggers: ['validate json', 'validate this json', 'is this valid json', 'valid json'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:validate this json|validate json|is this valid json)\s*(.*)/i);
            return [m ? m[1].trim() : null];
        }
    }
};