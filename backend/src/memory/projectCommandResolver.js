const projectRegistry = require('./projectRegistry');

function normalizeName(name) {
    if (!name) return '';

    return name
        .trim()
        .replace(/[.!?]+$/, '')
        .replace(/\s+/g, ' ');
}

/**
 * Detects explicit requests to create a new project.
 *
 * This does NOT create anything.
 * It only determines whether the user's message is
 * explicitly asking for project creation.
 */
function detectProjectCreation(message) {
    if (!message) {
        return {
            detected: false
        };
    }

    const patterns = [
        /(?:create|make|start|add)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named)\s+(.+)/i,
        /(?:create|make|start|add)\s+(?:a\s+)?new\s+project\s+(.+)/i,
        /i(?:'m| am)\s+(?:going to|gonna)\s+start\s+(?:a\s+)?new\s+project\s+(?:called|named)\s+(.+)/i,
        /i(?:'m| am)\s+(?:going to|gonna)\s+(?:create|make)\s+(?:a\s+)?new\s+project\s+(?:called|named)\s+(.+)/i
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);

        if (match) {
            const projectName = normalizeName(match[1]);

            if (!projectName) {
                return {
                    detected: false
                };
            }

            return {
                detected: true,
                action: 'create_project',
                requestedName: projectName
            };
        }
    }

    return {
        detected: false
    };
}

/**
 * Resolve an explicit project creation request.
 *
 * This still does NOT create the project.
 */
async function resolveProjectCreation(message) {
    const detection = detectProjectCreation(message);

    if (!detection.detected) {
        return {
            detected: false
        };
    }

    const existing = await projectRegistry.findProject(
        detection.requestedName
    );

    if (existing) {
        return {
            detected: true,
            action: 'already_exists',
            project: existing,
            requestedName: detection.requestedName
        };
    }

    return {
        detected: true,
        action: 'create',
        project: null,
        requestedName: detection.requestedName
    };
}

module.exports = {
    detectProjectCreation,
    resolveProjectCreation
};