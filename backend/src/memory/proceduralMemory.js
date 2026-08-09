const supabase = require('../database/supabaseClient');

async function getAll() {
    const { data, error } = await supabase
        .from('procedural_memory')
        .select('trigger, action, context, updated_at');

    if (error) {
        console.error('Failed to load procedural memory:', error.message);
        return [];
    }
    return data;
}

async function addProcedure({ trigger, action, context = 'general' }) {
    // Same case-insensitive match-on-trigger semantics as the old JSON
    // version. Postgres unique constraints are case-sensitive, so this stays
    // a manual find-then-update/insert rather than a DB-level upsert.
    const { data: existing, error: findError } = await supabase
        .from('procedural_memory')
        .select('id')
        .ilike('trigger', trigger)
        .maybeSingle();

    if (findError) {
        throw new Error(`Failed to check existing procedure: ${findError.message}`);
    }

    const now = new Date().toISOString();

    if (existing) {
        const { error } = await supabase
            .from('procedural_memory')
            .update({ trigger, action, context, updated_at: now })
            .eq('id', existing.id);

        if (error) throw new Error(`Failed to update procedure: ${error.message}`);
    } else {
        const { error } = await supabase
            .from('procedural_memory')
            .insert({ trigger, action, context, updated_at: now });

        if (error) throw new Error(`Failed to insert procedure: ${error.message}`);
    }

    return true;
}

module.exports = { getAll, addProcedure };
