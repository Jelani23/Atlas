const supabase = require('../database/supabaseClient');

async function addKnowledge({ subject, key, value }) {
    const { error } = await supabase
        .from('knowledge_library')
        .upsert({
            subject: subject || 'general',
            key,
            value,
            updated_at: new Date().toISOString()
        }, { onConflict: 'subject,key' });

    if (error) {
        throw new Error(`Failed to save knowledge: ${error.message}`);
    }
    return true;
}

async function getAll() {
    const { data, error } = await supabase
        .from('knowledge_library')
        .select('subject, key, value, updated_at');

    if (error) {
        console.error('Failed to load knowledge library:', error.message);
        return [];
    }
    return data;
}

async function search(query) {
    // Postgres or() with ilike gives the same "match subject OR key OR value"
    // behavior the old Array.filter() had.
    const pattern = `%${query}%`;
    const { data, error } = await supabase
        .from('knowledge_library')
        .select('subject, key, value, updated_at')
        .or(`subject.ilike.${pattern},key.ilike.${pattern},value.ilike.${pattern}`);

    if (error) {
        console.error('Failed to search knowledge library:', error.message);
        return [];
    }
    return data;
}

module.exports = { addKnowledge, getAll, search };
