/**
 * Memory Deduplicator
 *
 * Determines what should happen to an extracted memory based on
 * an existing canonical memory.
 *
 * This module contains decision logic only.
 * Database access belongs to the individual memory stores.
 */

function normalize(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .trim()
        .toLowerCase();
}

function valuesEqual(existingValue, newValue, { caseSensitive = false } = {}) {
    if (caseSensitive) return String(existingValue ?? '').trim() === String(newValue ?? '').trim();
    return normalize(existingValue) === normalize(newValue);
}

function getMemoryIdentity(memory) {
    if (!memory || typeof memory !== 'object') {
        return null;
    }

    const category = normalize(memory.category);
    const subject = normalize(memory.subject);
    const key = normalize(memory.key);

    if (category === 'project') {
        return {
            type: 'project',
            subject,
            key
        };
    }

    if (category === 'knowledge') {
        // Knowledge's canonical identity is category + subject + key,
        // where "category" here is knowledge's OWN domain field
        // (science/technology/history/...), carried on the object as
        // `knowledge_category` to avoid colliding with this
        // function's `memory.category` (the memory-BANK
        // discriminator, always the literal string "knowledge" for
        // anything reaching this branch - see knowledgeLibrary.js's
        // header comment for the full explanation). Defaulting to
        // 'general' matches knowledgeLibrary.js's own default, so an
        // extraction that omits it still resolves to the same
        // identity buildRow() would have stored it under.
        return {
            type: 'knowledge',
            category: normalize(memory.knowledge_category) || 'general',
            subject,
            key
        };
    }

    if (category === 'procedure') {
        return {
            type: 'procedure',
            subject,
            key
        };
    }

    return {
        type: 'user_profile',
        category,
        key
    };
}

function validateMemory(memory) {
    if (!memory || typeof memory !== 'object') {
        return {
            valid: false,
            reason: 'Memory is not an object.'
        };
    }

    if (!memory.category || !String(memory.category).trim()) {
        return {
            valid: false,
            reason: 'Memory is missing a category.'
        };
    }

    if (!memory.key || !String(memory.key).trim()) {
        return {
            valid: false,
            reason: 'Memory is missing a key.'
        };
    }

    if (memory.value === undefined || memory.value === null) {
        return {
            valid: false,
            reason: 'Memory is missing a value.'
        };
    }

    return {
        valid: true,
        reason: null
    };
}

/**
 * Determine the correct action for a memory.
 *
 * Actions:
 *
 *   insert    No matching memory exists.
 *   duplicate Matching memory exists with the same value.
 *   update    Matching memory exists with a different value and
 *             this memory type supports replacement semantics.
 *   conflict  Reserved for future memory types that require conflict
 *             preservation rather than replacement.
 *   ignored   Invalid memory.
 */
function determineAction(memory, existingMemory = null, semanticResolution = null) {
    const validation = validateMemory(memory);

    if (!validation.valid) {
        return {
            action: 'ignored',
            memory,
            existing: existingMemory,
            identity: getMemoryIdentity(memory),
            reason: validation.reason
        };
    }

    const identity = getMemoryIdentity(memory);

    if (!existingMemory) {
        return {
            action: 'insert',
            memory,
            existing: null,
            identity,
            reason: 'No existing memory matches this identity.'
        };
    }

    if (semanticResolution?.matched) {
        if (semanticResolution.relation === 'equivalent') {
            return {
                action: 'duplicate',
                memory,
                existing: existingMemory,
                identity,
                semantic: semanticResolution,
                reason: 'Semantic canonicalization found an equivalent existing memory.'
            };
        }

        if (semanticResolution.relation === 'conflict') {
            return {
                action: 'conflict',
                memory,
                existing: existingMemory,
                identity,
                semantic: semanticResolution,
                reason: 'Semantic canonicalization found incompatible values for the same identity.'
            };
        }

        if (semanticResolution.relation === 'update') {
            return {
                action: 'update',
                memory,
                existing: existingMemory,
                identity,
                semantic: semanticResolution,
                reason: 'Semantic canonicalization matched an existing identity with a newer value.'
            };
        }
    }

    if (valuesEqual(existingMemory.value, memory.value, { caseSensitive: memory.category === 'knowledge' })) {
        return {
            action: 'duplicate',
            memory,
            existing: existingMemory,
            identity,
            reason: 'An equivalent memory already exists.'
        };
    }

    return {
        action: 'update',
        memory,
        existing: existingMemory,
        identity,
        reason: 'An existing memory with the same identity has a different value.'
    };
}

module.exports = {
    determineAction,
    getMemoryIdentity,
    valuesEqual,
    validateMemory
};
