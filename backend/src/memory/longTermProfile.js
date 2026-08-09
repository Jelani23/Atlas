const supabase = require('../database/supabaseClient');

async function get(category = null) {
    let query = supabase
        .from('user_profile')
        .select('category, key, value, confidence')
        .order('updated_at', { ascending: false });

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Failed to load long-term profile:', error.message);
        return [];
    }
    return data;
}

async function getContextString(category = null) {
    const profile = await get(category);

    if (!profile || profile.length === 0) {
        return "No stored information.";
    }

    return profile
        .map(item => `${item.key}: ${item.value}`)
        .join('\n');
}

async function update(observation) {
    // Same upsert-by-(category, key) semantics as before, now enforced by the
    // unique(category, key) constraint in the Supabase schema.
    const { error } = await supabase
        .from('user_profile')
        .upsert({
            category: observation.category,
            key: observation.key,
            value: observation.value,
            confidence: observation.confidence ?? 1.0
        }, { onConflict: 'category,key' });

    if (error) {
        throw new Error(`Failed to update long-term profile: ${error.message}`);
    }

    return true;
}

module.exports = {
    get,
    getContextString,
    update
};
