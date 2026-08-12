const supabase = require('../database/supabaseClient');

async function getAll() {
    const { data, error } = await supabase
        .from('procedural_memory')
        .select('id, trigger, action, context, updated_at');

    if (error) {
        console.error('Failed to load procedural memory:', error.message);
        return [];
    }

    return data;
}

/**
 * Find an existing procedure by its trigger.
 *
 * This preserves the existing case-insensitive trigger semantics.
 */
async function find(trigger) {
    const { data, error } = await supabase
        .from('procedural_memory')
        .select('id, trigger, action, context, updated_at')
        .ilike('trigger', trigger)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to find existing procedure: ${error.message}`);
    }

    return data || null;
}

async function addProcedure({ trigger, action, context = 'general' }) {
    const existing = await find(trigger);
    const now = new Date().toISOString();

    if (existing) {
        const { error } = await supabase
            .from('procedural_memory')
            .update({
                trigger,
                action,
                context,
                updated_at: now
            })
            .eq('id', existing.id);

        if (error) {
            throw new Error(`Failed to update procedure: ${error.message}`);
        }
    } else {
        const { error } = await supabase
            .from('procedural_memory')
            .insert({
                trigger,
                action,
                context,
                updated_at: now
            });

        if (error) {
            throw new Error(`Failed to insert procedure: ${error.message}`);
        }
    }

    return true;
}

module.exports = {
    getAll,
    find,
    addProcedure
};