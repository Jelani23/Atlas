const supabase = require('../database/supabaseClient');

async function getAll() {
    const { data, error } = await supabase
        .from('world_model')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
        console.error('Failed to load world model:', error.message);
        return null;
    }

    return data ? data.data : null;
}

module.exports = { getAll };
