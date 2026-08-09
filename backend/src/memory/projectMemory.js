const supabase = require('../database/supabaseClient');

async function update(memoryData) {
    const { error } = await supabase
        .from('project_memory')
        .insert({
            subject: memoryData.subject || 'general',
            key: memoryData.key,
            value: memoryData.value
        });

    if (error) {
        throw new Error(`Failed to save project memory: ${error.message}`);
    }
}

async function get(project) {
    let query = supabase.from('project_memory').select('subject, key, value, created_at');

    if (project) {
        // ilike = case-insensitive match, mirrors the old .toLowerCase() comparison
        query = query.ilike('subject', project);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Failed to load project memory:', error.message);
        return [];
    }
    return data;
}

async function getContextString(project) {
    const memories = await get(project);

    if (!memories.length) {
        return "";
    }

    return memories
        .map(memory => `- ${memory.subject}: ${memory.key} = ${memory.value}`)
        .join("\n");
}

module.exports = {
    update,
    get,
    getContextString
};
