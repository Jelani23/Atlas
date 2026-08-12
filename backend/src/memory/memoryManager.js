const longTermProfile = require('./longTermProfile');
const projectMemory = require('./projectMemory');
const knowledgeLibrary = require('./knowledgeLibrary');
const proceduralMemory = require('./proceduralMemory');
const memoryCache = require('../core/memoryCache');
const memoryDeduplicator = require('./memoryDeduplicator');
const projectResolver = require('./projectResolver');

async function findExistingMemory(memory) {
    const category = memory.category;
    const subject = memory.subject || 'general';

    switch (category) {
        case 'project': {
            const memories = await projectMemory.get(subject);

            const normalizedKey = String(memory.key || '').trim().toLowerCase();

            return memories.find(existing =>
                String(existing.key || '').trim().toLowerCase() === normalizedKey
            ) || null;
        }

        case 'knowledge':
            return await knowledgeLibrary.find(subject, memory.key);

        case 'procedure':
            return await proceduralMemory.find(memory.key);

        case 'identity':
        case 'preference':
        case 'behavior':
        case 'relationship':
        case 'state':
        case 'history':
        case 'user':
            return await longTermProfile.find(category, memory.key);

        default:
            return null;
    }
}

async function handleMemoryAction(extractedMemories) {
    if (!Array.isArray(extractedMemories)) {
        extractedMemories = [extractedMemories];
    }

    if (extractedMemories.length === 0) {
        return {
            action: "none",
            message: "Nothing to remember."
        };
    }

    const results = [];
    const savedMemories = [];
    const duplicates = [];
    const conflicts = [];
    const ignored = [];

    for (const memory of extractedMemories) {
        if (!memory || !memory.shouldRemember) {
            ignored.push({
                memory,
                reason: 'Memory was not marked for storage.'
            });
            continue;
        }

        // Project state is controlled by the project registry.
        // The memory extractor may suggest a project, but it cannot create
        // or switch projects implicitly.
        if (
            memory.category === 'state' &&
            memory.key === 'current_project'
        ) {
            const projectResult = projectResolver.resolveProjectChange(
                memory.value
            );

            if (!projectResult.allowed) {
                console.log(
                    `[MemoryManager] 🚫 Rejected current_project="${memory.value}" — not a registered project.`
                );

                ignored.push({
                    memory,
                    reason: 'Project is not registered in the project registry.'
                });

                continue;
            }

            // Store the canonical project name rather than whatever casing
            // or alias the extractor happened to produce.
            memory.value = projectResult.project.name;
        }

        try {
            const existingMemory = await findExistingMemory(memory);

            const decision = memoryDeduplicator.determineAction(
                memory,
                existingMemory
            );

            console.log(
                `[MemoryDedup] ${memory.category}/${memory.key} → ${decision.action} | ${decision.reason}`
            );

            results.push(decision);

            if (decision.action === 'ignored') {
                ignored.push(decision);
                continue;
            }

            if (decision.action === 'duplicate') {
                duplicates.push(decision);
                continue;
            }

            if (decision.action === 'conflict') {
                conflicts.push(decision);
                continue;
            }

            if (decision.action === 'insert' || decision.action === 'update') {
                if (memory.category === 'project') {
                    /*
                     * Project memory intentionally remains append-oriented
                     * for now. Its state model will be redesigned separately.
                     *
                     * An exact duplicate was already filtered above.
                     * A new entry is therefore safe to insert.
                     */
                    await projectMemory.update({
                        subject: memory.subject || 'general',
                        key: memory.key,
                        value: memory.value
                    });

                    memoryCache.invalidate('project_memory');
                    savedMemories.push(memory);
                }

                else if (
                    [
                        'identity',
                        'preference',
                        'behavior',
                        'relationship',
                        'state',
                        'history',
                        'user'
                    ].includes(memory.category)
                ) {
                    await longTermProfile.update({
                        category: memory.category,
                        key: memory.key,
                        value: memory.value,
                        confidence: memory.confidence || 1.0
                    });

                    memoryCache.invalidate('user_profile');
                    savedMemories.push(memory);
                }

                else if (memory.category === 'knowledge') {
                    await knowledgeLibrary.addKnowledge({
                        subject: memory.subject || 'general',
                        key: memory.key,
                        value: memory.value
                    });

                    memoryCache.invalidate('knowledge_library');
                    savedMemories.push(memory);
                }

                else if (memory.category === 'procedure') {
                    await proceduralMemory.addProcedure({
                        trigger: memory.key,
                        action: memory.value,
                        context: memory.subject || 'general'
                    });

                    memoryCache.invalidate('procedural_memory');
                    savedMemories.push(memory);
                }

                else {
                    ignored.push({
                        memory,
                        reason: `Unsupported memory category: ${memory.category}`
                    });
                }
            }
        } catch (error) {
            console.error(
                `[MemoryManager] Failed to process memory ${memory.category}/${memory.key}:`,
                error.message
            );

            ignored.push({
                memory,
                reason: error.message
            });
        }
    }

    if (savedMemories.length > 0) {
        return {
            action: "saved",
            memories: savedMemories,
            duplicates,
            conflicts,
            ignored
        };
    }

    if (duplicates.length > 0 && conflicts.length === 0 && ignored.length === 0) {
        return {
            action: "duplicate",
            memories: [],
            duplicates,
            conflicts: [],
            ignored: []
        };
    }

    if (conflicts.length > 0) {
        return {
            action: savedMemories.length > 0 ? "saved_with_conflicts" : "conflict",
            memories: savedMemories,
            duplicates,
            conflicts,
            ignored
        };
    }

    return {
        action: "ignored",
        memories: [],
        duplicates,
        conflicts,
        ignored
    };
}

module.exports = {
    handleMemoryAction
};