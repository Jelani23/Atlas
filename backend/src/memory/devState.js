const supabase = require('../database/supabaseClient');

async function getAll() {
    const { data, error } = await supabase
        .from('dev_state')
        .select('id, feature, status, updated_at');

    if (error) {
        console.error('Failed to load dev state:', error.message);
        return [];
    }
    return data;
}

// Helper to format feature names to Title Case (e.g., "planning_engine" -> "Planning Engine")
function toTitleCase(str) {
    let cleanStr = str.replace(/[_-]/g, ' ');
    return cleanStr.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// Helper to normalize strings for fuzzy matching (removes spaces, underscores, hyphens)
function normalizeForMatch(str) {
    return str.toLowerCase().replace(/[\s_-]/g, '');
}

async function updateFeature(feature, status) {
    // Fuzzy matching (substring-either-way against normalized names) isn't
    // something Postgres can do cheaply in a single query here, so - same as
    // before - pull the (small) table and match in JS, then write back by id.
    const state = await getAll();
    const normalizedFeature = normalizeForMatch(feature);
    const cleanStatus = status.replace(/_/g, ' ').toLowerCase();

    const existing = state.find(f => {
        const normalizedExisting = normalizeForMatch(f.feature);
        return normalizedExisting.includes(normalizedFeature) || normalizedFeature.includes(normalizedExisting);
    });

    const now = new Date().toISOString();

    if (existing) {
        const { error } = await supabase
            .from('dev_state')
            .update({ status: cleanStatus, updated_at: now })
            .eq('id', existing.id);

        if (error) throw new Error(`Failed to update dev state: ${error.message}`);
        return { updated: true, feature: existing.feature, status: cleanStatus };
    } else {
        const titleCaseFeature = toTitleCase(feature);
        const { error } = await supabase
            .from('dev_state')
            .insert({ feature: titleCaseFeature, status: cleanStatus, updated_at: now });

        if (error) throw new Error(`Failed to insert dev state: ${error.message}`);
        return { updated: false, feature: titleCaseFeature, status: cleanStatus };
    }
}

module.exports = { getAll, updateFeature };
