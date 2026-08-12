const supabase = require('../database/supabaseClient');

async function get(category = null) {
    let query = supabase
        .from('user_profile')
        .select('id, category, key, value, confidence, created_at, updated_at')
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

/**
 * Find the canonical profile memory for a category/key pair.
 */
async function find(category, key) {
    const { data, error } = await supabase
        .from('user_profile')
        .select('id, category, key, value, confidence, created_at, updated_at')
        .eq('category', category)
        .eq('key', key)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to find long-term profile memory: ${error.message}`);
    }

    return data || null;
}

async function update(observation) {
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
    find,
    update
};