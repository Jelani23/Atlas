const supabase = require('../database/supabaseClient');

async function update(memoryData) {
    const { error } = await supabase
        .from('project_memory')
        .upsert({
            project_key: memoryData.project_key,
            subject: memoryData.subject || 'general',
            key: memoryData.key,
            value: memoryData.value
        }, {
            onConflict: 'project_key,key'
        });

    if (error) {
        throw new Error(`Failed to save project memory: ${error.message}`);
    }
}

async function get(projectKey) {
    let query = supabase
        .from('project_memory')
        .select('project_key, subject, key, value, created_at');

    if (projectKey) {
        query = query.eq('project_key', projectKey);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to load project memory:', error.message);
        return [];
    }

    return data || [];
}

async function getContextString(projectKey) {
    const memories = await get(projectKey);

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