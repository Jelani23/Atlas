const projectResolver = require('./projectResolver');

function detectProjectCommand(message) {
    if (!message) {
        return {
            type: 'none'
        };
    }

    const text = message.trim();

    // Explicit project creation
    const createMatch = text.match(
        /(?:create|make|start|add)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)\s+(.+?)(?:[.!?]|$)/i
    );

    if (createMatch) {
        const requestedName = createMatch[1].trim();

        return {
            type: 'create_project',
            requestedName,
            resolution: projectResolver.resolveProjectCreation(requestedName)
        };
    }

    // "I want to create a new project called X"
    const createIntentMatch = text.match(
        /(?:i(?:'m| am)?\s+going\s+to|i\s+want\s+to|i\s+think\s+i(?:'m| am)?\s+going\s+to)\s+(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)\s+(.+?)(?:[.!?]|$)/i
    );

    if (createIntentMatch) {
        const requestedName = createIntentMatch[1].trim();

        return {
            type: 'create_project',
            requestedName,
            resolution: projectResolver.resolveProjectCreation(requestedName)
        };
    }

    return {
        type: 'none'
    };
}

module.exports = {
    detectProjectCommand
};