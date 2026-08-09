const supabase = require('../database/supabaseClient');

async function append(message, sessionId) {
    if (!sessionId) {
        throw new Error("No active session.");
    }

    const { error } = await supabase
        .from('conversations')
        .insert({
            session_id: sessionId,
            role: message.role,
            content: message.content
        });

    if (error) {
        throw new Error(`Failed to append to working memory: ${error.message}`);
    }
}

async function getHistory(sessionId, limit = 20) {
    if (!sessionId) {
        return [];
    }

    const { data, error } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('id', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Failed to load working memory history:', error.message);
        return [];
    }

    return data.reverse();
}

async function clear(sessionId) {
    if (!sessionId) {
        return;
    }

    const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('session_id', sessionId);

    if (error) {
        console.error('Failed to clear working memory:', error.message);
    }
}

module.exports = {
    append,
    getHistory,
    clear
};
