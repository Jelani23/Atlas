const projectResolver = require('./projectResolver');

function normalizeProjectName(name) {
    if (!name) return '';

    return name
        .trim()
        .replace(/[.!?,]+$/, '')
        .replace(/\s+(now|right now|currently|again|today)$/i, '')
        .replace(/\s+(project)$/i, '')
        .trim();
}

async function extract(message) {
    console.log('[DeterministicExtractor] INPUT:', JSON.stringify(message));

    const memories = [];
    const lowerMsg = message.toLowerCase().trim();

    // 1. Pattern: "My favorite [X] is [Y]"
    const favMatch = message.match(/my favorite (\w+(?:\s\w+)?) is (.+)/i);

    if (favMatch) {
        const keyPart = favMatch[1]
            .toLowerCase()
            .replace(/\s+/g, '_');

        const value = favMatch[2]
            .replace(/[.!?]$/, '')
            .trim();

        memories.push({
            shouldRemember: true,
            category: 'preference',
            subject: 'user',
            key: `favorite_${keyPart}`,
            value,
            confidence: 0.95
        });
    }

    // 2. Pattern: "Switch to [X]" / "Move to [X]" / "Go back to [X]"
    const switchMatch = message.match(
        /(?:switch to|move to|go back to)\s+(?:the\s+)?(.+?)(?:[.!?]|$)/i
    );

    if (switchMatch) {
        const requestedName = normalizeProjectName(switchMatch[1]);
        const result = await projectResolver.resolveProjectChange(requestedName);

        if (result.allowed) {
            memories.push({
                shouldRemember: true,
                category: 'state',
                subject: 'user',
                key: 'current_project',
                value: result.project.project_key,
                confidence: 0.95
            });
        }
    }

    // 3. Pattern: "I am working on [X]" / "I'm working on [X]"
    // This represents USER STATE, not project memory.
    // The project name is resolved through the project registry.
    const workMatch = message.match(
        /i(?:'m| am)\s+(?:(?:currently|back|still)\s+)?(?:working on|working with)\s+(?:the\s+)?(.+?)(?:[.!?]|$)/i
    );

    if (workMatch) {
        const requestedName = normalizeProjectName(workMatch[1]);

        if (requestedName) {
            const result = await projectResolver.resolveProject(requestedName);

            if (result.type === 'existing_project') {
                memories.push({
                    shouldRemember: true,
                    category: 'state',
                    subject: 'user',
                    key: 'current_project',
                    value: result.project.project_key,
                    confidence: 0.90
                });
            }
        }
    }

    if (memories.length > 0) {
        return {
            memories,
            conversation_update: {},
            deterministic: true
        };
    }

    return {
        memories: [],
        conversation_update: {},
        deterministic: false
    };
}

module.exports = { extract };