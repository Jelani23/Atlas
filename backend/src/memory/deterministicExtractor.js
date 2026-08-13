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

function normalizeMemoryValue(value) {
    return value
        .replace(/[.!?]+$/, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeMemoryKey(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
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

    // 4. Project Fact Fast Path
    //
    // Examples:
    // "Bindex uses email verification"
    // "Bindex requires email verification"
    // "Bindex supports shared binders"
    // "Bindex includes a wishlist"
    // "Bindex has a Stripe integration"
    // "Bindex connects to Supabase"
    // "Bindex is built with Electron"
    // "Bindex depends on the TCG API"
    // "Bindex runs on Vercel"
    // "Bindex works with Scrydex"
    //
    // IMPORTANT:
    // We only treat the first phrase as the project name if it resolves
    // to a registered project. This prevents arbitrary sentences from
    // becoming project memories.

    const projectFactMatch = message.match(
        /^(?:the\s+)?(.+?)\s+(uses|requires|supports|includes|has|connects to|connects with|is built with|is built using|depends on|runs on|works with)\s+(.+?)(?:[.!?]|$)/i
    );

    if (projectFactMatch) {
        const requestedName = normalizeProjectName(projectFactMatch[1]);
        const factVerb = projectFactMatch[2].toLowerCase().trim();
        const rawValue = normalizeMemoryValue(projectFactMatch[3]);

        if (requestedName && rawValue) {
            const result = await projectResolver.resolveProject(requestedName);

            if (result.type === 'existing_project') {
                const project = result.project;

                const factKey = `${factVerb.replace(/\s+/g, '_')}_${normalizeMemoryKey(rawValue)}`;

                memories.push({
                    shouldRemember: true,
                    category: 'project',
                    subject: project.project_key,
                    key: factKey,
                    value: rawValue,
                    confidence: 0.95
                });

                console.log(
                    `[DeterministicExtractor] Project fact detected: ${project.project_key} | ${factKey} | ${rawValue}`
                );
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