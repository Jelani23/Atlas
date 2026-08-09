const supabase = require('../database/supabaseClient');

let currentSessionId = null;

async function startSession() {
    const { data, error } = await supabase
        .from('sessions')
        .insert({})
        .select('id')
        .single();

    if (error) {
        throw new Error(`Failed to start session in Supabase: ${error.message}`);
    }

    currentSessionId = data.id;
    return currentSessionId;
}

function getCurrentSession() {
    return currentSessionId;
}

// Most recent sessions, each with a preview pulled from its first user
// message — enough to render a conversation history list without pulling
// every message for every session.
async function listSessions(limit = 50) {
    const { data, error } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Failed to list sessions from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
        return [];
    }

    const ids = data.map((s) => s.id);
    const { data: userMessages, error: previewError } = await supabase
        .from('conversations')
        .select('session_id, content')
        .in('session_id', ids)
        .eq('role', 'user')
        .order('id', { ascending: true });

    if (previewError) {
        // Non-fatal — the list is still useful without previews.
        console.error('Failed to load conversation previews:', previewError.message);
    }

    const previewBySession = new Map();
    for (const row of userMessages || []) {
        if (!previewBySession.has(row.session_id)) {
            previewBySession.set(row.session_id, row.content);
        }
    }

    return data.map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        preview: previewBySession.get(s.id) || '',
    }));
}

// Full ordered transcript for a single session (for reopening a past
// conversation, or restoring the current one after a renderer reload).
async function getSessionMessages(sessionId) {
    if (!sessionId) {
        return [];
    }

    const { data, error } = await supabase
        .from('conversations')
        .select('role, content, timestamp')
        .eq('session_id', sessionId)
        .order('id', { ascending: true });

    if (error) {
        throw new Error(`Failed to load conversation from Supabase: ${error.message}`);
    }

    return data;
}

async function endSession() {
    if (!currentSessionId) {
        return;
    }

    const { error } = await supabase
        .from('sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', currentSessionId);

    if (error) {
        console.error('Failed to close session in Supabase:', error.message);
    }

    currentSessionId = null;
}

module.exports = {
    startSession,
    getCurrentSession,
    endSession,
    listSessions,
    getSessionMessages
};
