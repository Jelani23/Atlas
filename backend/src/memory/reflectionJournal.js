const supabase = require('../database/supabaseClient');

async function append(entry) {
    const { error } = await supabase
        .from('reflections')
        .insert({
            session_id: entry.sessionId || null,
            summary: entry.summary,
            timestamp: new Date().toISOString()
        });

    if (error) {
        throw new Error(`Failed to save reflection: ${error.message}`);
    }
    return true;
}

async function getRecent(limit = 1) {
    const { data, error } = await supabase
        .from('reflections')
        .select('session_id, summary, timestamp')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Failed to load reflections:', error.message);
        return [];
    }

    // Old JSON version returned oldest-to-newest for the slice(-limit) it did;
    // match that ordering here since index.js reads recentReflections[0] as
    // "the most recent one".
    return data;
}

module.exports = { append, getRecent };
