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

function valuesEqual(existingValue, newValue) {
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
        return {
            type: 'knowledge',
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
 *   conflict  Matching project memory exists with a different value.
 *             Project conflicts are intentionally preserved until the
 *             project-memory model is redesigned.
 *   ignored   Invalid memory.
 */
function determineAction(memory, existingMemory = null) {
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

    if (valuesEqual(existingMemory.value, memory.value)) {
        return {
            action: 'duplicate',
            memory,
            existing: existingMemory,
            identity,
            reason: 'An equivalent memory already exists.'
        };
    }

    if (identity.type === 'project') {
        return {
            action: 'conflict',
            memory,
            existing: existingMemory,
            identity,
            reason:
                'A project memory with the same subject and key already exists with a different value. ' +
                'Project memory conflicts are preserved until the project-memory model is redesigned.'
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