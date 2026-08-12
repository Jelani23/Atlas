const supabase = require('../database/supabaseClient');

async function addProcedure(memoryData) {
    if (!memoryData) {
        throw new Error('Procedure memory data is required.');
    }

    if (!memoryData.trigger) {
        throw new Error('Procedure memory requires a trigger.');
    }

    if (!memoryData.action) {
        throw new Error('Procedure memory requires an action.');
    }

    const { error } = await supabase
        .from('procedural_memory')
        .insert({
            trigger: memoryData.trigger,
            action: memoryData.action,
            context: memoryData.context || 'general'
        });

    if (error) {
        throw new Error(
            `Failed to save procedural memory: ${error.message}`
        );
    }
}

async function getAll() {
    const { data, error } = await supabase
        .from('procedural_memory')
        .select('id, trigger, action, context');

    if (error) {
        console.error(
            'Failed to load procedural memory:',
            error.message
        );

        return [];
    }

    return data || [];
}

async function find(trigger) {
    if (!trigger) {
        return null;
    }

    const { data, error } = await supabase
        .from('procedural_memory')
        .select('id, trigger, action, context')
        .eq('trigger', trigger)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to find procedural memory: ${error.message}`
        );
    }

    return data || null;
}

async function getContextString() {
    const memories = await getAll();

    if (!memories.length) {
        return "";
    }

    return memories
        .map(memory =>
            `- ${memory.trigger}: ${memory.action}`
        )
        .join("\n");
}

module.exports = {
    addProcedure,
    getAll,
    find,
    getContextString
};