const supabase = require('../database/supabaseClient');

/**
 * ============================================================
 * PROCEDURAL MEMORY STORAGE
 * ============================================================
 *
 * Procedural memory is represented using layered semantic
 * identifiers:
 *
 *   category
 *   subject
 *   key
 *
 * The canonical identity is:
 *
 *   category + subject + key
 *
 * topics are retrieval metadata and are NOT part of identity.
 *
 * trigger describes when the procedure applies.
 * action describes what Alice should do.
 * context provides optional narrower execution context.
 *
 * This module is intentionally limited to storage/retrieval.
 * It does NOT decide whether something is procedural memory
 * or determine its semantic classification.
 *
 * ============================================================
 */

/**
 * ------------------------------------------------------------
 * ADD PROCEDURE
 * ------------------------------------------------------------
 *
 * Inserts a new canonical procedural memory.
 *
 * IMPORTANT:
 * Canonicalization/deduplication decisions should happen
 * before this function is called.
 *
 * The database identity is:
 *
 *   category + subject + key
 *
 * ------------------------------------------------------------
 */

async function addProcedure(memoryData) {

    if (!memoryData) {
        throw new Error(
            'Procedure memory data is required.'
        );
    }

    if (!memoryData.category) {
        throw new Error(
            'Procedure memory requires a category.'
        );
    }

    if (!memoryData.subject) {
        throw new Error(
            'Procedure memory requires a subject.'
        );
    }

    if (!memoryData.key) {
        throw new Error(
            'Procedure memory requires a key.'
        );
    }

    if (!memoryData.trigger) {
        throw new Error(
            'Procedure memory requires a trigger.'
        );
    }

    if (!memoryData.action) {
        throw new Error(
            'Procedure memory requires an action.'
        );
    }

    const { error } = await supabase
        .from('procedural_memory')
        .insert({
            category: memoryData.category,
            subject: memoryData.subject,
            topics: Array.isArray(memoryData.topics)
                ? memoryData.topics
                : [],
            key: memoryData.key,
            value: memoryData.value,

            trigger: memoryData.trigger,
            action: memoryData.action,
            context: memoryData.context || 'general',

            confidence:
                memoryData.confidence ?? 1.0
        });

    if (error) {
        throw new Error(
            `Failed to save procedural memory: ${error.message}`
        );
    }

    return true;
}

async function updateProcedure(memoryData) {
    if (!memoryData) {
        throw new Error(
            'Procedure memory data is required.'
        );
    }

    if (!memoryData.category) {
        throw new Error(
            'Procedure memory requires a category.'
        );
    }

    if (!memoryData.subject) {
        throw new Error(
            'Procedure memory requires a subject.'
        );
    }

    if (!memoryData.key) {
        throw new Error(
            'Procedure memory requires a key.'
        );
    }

    if (!memoryData.trigger) {
        throw new Error(
            'Procedure memory requires a trigger.'
        );
    }

    if (!memoryData.action) {
        throw new Error(
            'Procedure memory requires an action.'
        );
    }

    if (!memoryData.value) {
        throw new Error(
            'Procedure memory requires a value.'
        );
    }

    const { data, error } = await supabase
        .from('procedural_memory')
        .update({
            topics: Array.isArray(memoryData.topics)
                ? memoryData.topics
                : [],
            trigger: memoryData.trigger,
            action: memoryData.action,
            context: memoryData.context || 'general',
            confidence: memoryData.confidence ?? 1.0,
            updated_at: new Date().toISOString()
        })
        .eq('category', memoryData.category)
        .eq('subject', memoryData.subject)
        .eq('key', memoryData.key)
        .select()
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to update procedural memory: ${error.message}`
        );
    }

    if (!data) {
        throw new Error(
            'Procedural memory update matched no existing record.'
        );
    }

    return true;
}

/**
 * ------------------------------------------------------------
 * GET ALL
 * ------------------------------------------------------------
 *
 * Returns the complete procedural-memory records.
 *
 * This function remains available for administrative/debugging
 * use and for the existing context-string path.
 *
 * Retrieval logic should eventually use targeted semantic
 * queries rather than loading every procedure.
 *
 * ------------------------------------------------------------
 */

async function getAll() {

    const { data, error } = await supabase
        .from('procedural_memory')
        .select(`
            id,
            category,
            subject,
            topics,
            key,
            value,
            trigger,
            action,
            context,
            confidence,
            created_at,
            updated_at
        `)
        .order('updated_at', {
            ascending: false
        });

    if (error) {
        console.error(
            'Failed to load procedural memory:',
            error.message
        );

        return [];
    }

    return data || [];
}

/**
 * ------------------------------------------------------------
 * FIND BY CANONICAL IDENTITY
 * ------------------------------------------------------------
 *
 * Canonical procedural-memory identity:
 *
 *   category + subject + key
 *
 * This replaces the old trigger-only lookup.
 *
 * Trigger is content, not identity.
 *
 * ------------------------------------------------------------
 */

async function find(category, subject, key) {

    if (!category || !subject || !key) {
        return null;
    }

    const { data, error } = await supabase
        .from('procedural_memory')
        .select(`
            id,
            category,
            subject,
            topics,
            key,
            value,
            trigger,
            action,
            context,
            confidence,
            created_at,
            updated_at
        `)
        .eq('category', category)
        .eq('subject', subject)
        .eq('key', key)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to find procedural memory: ${error.message}`
        );
    }

    return data || null;
}

/**
 * ------------------------------------------------------------
 * GET CONTEXT STRING
 * ------------------------------------------------------------
 *
 * LEGACY / TRANSITIONAL FUNCTION
 *
 * This remains temporarily because the current system may still
 * expect a complete procedural-memory context string.
 *
 * It now includes the semantic layers so we do not throw away
 * the new structure when this function is used.
 *
 * Eventually this should be replaced by targeted procedural
 * retrieval.
 *
 * ------------------------------------------------------------
 */

async function getContextString() {

    const memories = await getAll();

    if (!memories.length) {
        return "";
    }

    return memories
        .map(memory => {

            const topics =
                Array.isArray(memory.topics) &&
                memory.topics.length > 0
                    ? ` | topics: ${memory.topics.join(', ')}`
                    : '';

            return (
                `- [${memory.category}/${memory.subject}/${memory.key}] ` +
                `${memory.trigger}: ${memory.action}` +
                topics
            );
        })
        .join("\n");
}

module.exports = {
    addProcedure,
    updateProcedure,
    getAll,
    find,
    getContextString
};