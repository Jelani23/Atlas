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
            if (!memory.project_key || !memory.subject || !memory.key) {
                return null;
            }

            return await projectMemory.getByIdentity(
                memory.project_key,
                memory.subject,
                memory.key
            );
        }

        case 'knowledge':
            // Canonical identity is category + subject + key, where
            // "category" is knowledge's own domain field (science,
            // technology, ...), carried as `knowledge_category` to
            // avoid colliding with this function's own `category`
            // variable (the memory-bank discriminator). Defaulting
            // to 'general' matches knowledgeLibrary.js's own default
            // so a memory that omits it still resolves to the same
            // identity it will be stored under.
            return await knowledgeLibrary.find(
                memory.knowledge_category || 'general',
                subject,
                memory.key
            );

        case 'procedure':
            return await proceduralMemory.find(
                memory.category,
                memory.subject,
                memory.key
            );

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
        if (!memory) {
            ignored.push({
                memory,
                reason: 'Memory is missing.'
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
            const projectResult = await projectResolver.resolveProjectChange(
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
            memory.value = projectResult.project.project_key;
        }

        try {
            if (memory.category === 'project') {
                // Phase: this used to fall back to `memory.subject` when
                // `project_key` was missing/unresolvable. `subject` is
                // documented to the extractor (see memoryExtractor.js's
                // prompt) as a domain area ("memory", "database", ...) and
                // explicitly "Never the project name" - so that fallback
                // was looking up exactly the field guaranteed NOT to be a
                // project identifier, which is how a correct extraction
                // (right key/value/category) still silently failed to
                // save: `subject` came back as something like "memory" or
                // a plural like "projects", failed to match any real
                // project, and got rejected here. `project_key` is now a
                // schema-enforced field (see buildExtractionSchema) - an
                // unresolvable project is now a real signal that the
                // extraction should be rejected, not a cue to guess from
                // an unrelated field.
                if (!memory.project_key) {
                    console.log(
                        `[MemoryManager] 🚫 Rejected project memory with no project_key (subject="${memory.subject}").`
                    );

                    ignored.push({
                        memory,
                        reason: 'Project memory is missing project_key.'
                    });

                    continue;
                }

                const projectResult = await projectResolver.resolveProject(
                    memory.project_key
                );

                if (projectResult.type !== 'existing_project') {
                    console.log(
                        `[MemoryManager] 🚫 Rejected project memory for unknown project "${memory.project_key}".`
                    );

                    ignored.push({
                        memory,
                        reason: 'Project is not registered in the project registry.'
                    });

                    continue;
                }

                memory.project_key = projectResult.project.project_key;
            }

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
                // Knowledge is the one memory type where a
                // "duplicate" (same canonical identity, same value)
                // still needs a write - the plan's §6 DUPLICATE /
                // REFRESH case explicitly calls for confidence,
                // source, and updated_at to be refreshed even when
                // the value itself hasn't materially changed, so a
                // second/third corroborating mention of the same
                // fact isn't silently a no-op. upsertKnowledge is the
                // same deterministic DB write used for insert/update
                // below - see its header comment for why one
                // operation covers all three cases here. Procedure
                // and project memories intentionally do NOT get this
                // treatment - their duplicate semantics are unchanged.
                if (memory.category === 'knowledge') {
                    await knowledgeLibrary.upsertKnowledge({
                        category: memory.knowledge_category || 'general',
                        subject: memory.subject || 'general',
                        topics: Array.isArray(memory.topics) ? memory.topics : [],
                        type: memory.type,
                        key: memory.key,
                        value: memory.value,
                        confidence: memory.confidence ?? 1.0,
                        source: memory.source,
                        source_type: memory.source_type
                    }, { preserveVerification: true });

                    memoryCache.invalidate('knowledge_library');
                }

                duplicates.push(decision);
                continue;
            }

            if (decision.action === 'conflict') {
                conflicts.push(decision);
                continue;
            }

            if (decision.action === 'insert' || decision.action === 'update') {
                if (memory.category === 'project') {
                    const projectKey = memory.project_key;

                    if (!projectKey) {
                        console.log(
                            `[MemoryManager] 🚫 Rejected project memory without project_key.`
                        );

                        ignored.push({
                            memory,
                            reason: 'Project memory is missing project_key.'
                        });

                        continue;
                    }

                    await projectMemory.update({
                        project_key: projectKey,
                        subject: memory.subject || 'general',
                        topics: Array.isArray(memory.topics)
                            ? memory.topics
                            : [],
                        key: memory.key,
                        value: memory.value,
                        confidence: memory.confidence || 1.0
                    });

                    memoryCache.invalidate('project_memory');

                    savedMemories.push({
                        ...memory,
                        project_key: projectKey
                    });
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
                    // insert and update both resolve to the same
                    // deterministic upsert - see upsertKnowledge's
                    // header comment in knowledgeLibrary.js.
                    await knowledgeLibrary.upsertKnowledge({
                        category: memory.knowledge_category || 'general',
                        subject: memory.subject || 'general',
                        topics: Array.isArray(memory.topics)
                            ? memory.topics
                            : [],
                        type: memory.type,
                        key: memory.key,
                        value: memory.value,
                        confidence: memory.confidence ?? 1.0,
                        source: memory.source,
                        source_type: memory.source_type
                    });

                    memoryCache.invalidate('knowledge_library');
                    savedMemories.push(memory);
                }

                else if (memory.category === 'procedure') {
                    const procedureData = {
                        category: memory.category,
                        subject: memory.subject || 'general',
                        topics: Array.isArray(memory.topics)
                            ? memory.topics
                            : [],
                        key: memory.key,
                        value: memory.value,
                        trigger: memory.trigger,
                        action: memory.action,
                        context: memory.context || 'general',
                        confidence: memory.confidence ?? 1.0
                    };

                    if (decision.action === 'insert') {
                        await proceduralMemory.addProcedure(procedureData);
                    }

                    else if (decision.action === 'update') {
                        await proceduralMemory.updateProcedure(procedureData);
                    }

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
