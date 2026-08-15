// backend/src/memory/sessionManager.js
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
        .select('id, started_at, ended_at, title')
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
        title: s.title || null,
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

// Deletes a session outright (right-click > Delete in the Conversations
// sidebar). `conversations` rows cascade via the FK in the schema, so this
// is the one call that fully removes a conversation log.
async function deleteSession(sessionId) {
    if (!sessionId) return;

    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to delete session from Supabase: ${error.message}`);
    }

    if (currentSessionId != null && String(currentSessionId) === String(sessionId)) {
        currentSessionId = null;
    }
}

// Renames a session (right-click > Rename). Empty string clears back to the
// auto preview.
async function renameSession(sessionId, title) {
    if (!sessionId) return null;

    const cleanTitle = (title || '').trim() || null;
    const { error } = await supabase
        .from('sessions')
        .update({ title: cleanTitle })
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to rename session in Supabase: ${error.message}`);
    }

    return cleanTitle;
}

// Quietly clears out sessions that never got a single message — abandoned
// "New conversation" clicks, connection hiccups, etc. — so they don't
// clutter the history list. `excludeId` protects whichever session is
// currently live (it may still be empty if nothing's been sent yet).
async function pruneEmptySessions(excludeId = null) {
    const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id');

    if (sessionsError || !sessions || sessions.length === 0) return;

    const { data: convRows, error: convError } = await supabase
        .from('conversations')
        .select('session_id');

    if (convError) {
        console.error('Failed to check for empty sessions:', convError.message);
        return;
    }

    const nonEmptyIds = new Set((convRows || []).map((r) => r.session_id));
    const emptyIds = sessions
        .map((s) => s.id)
        .filter((id) => !nonEmptyIds.has(id) && String(id) !== String(excludeId));

    if (emptyIds.length === 0) return;

    const { error: deleteError } = await supabase.from('sessions').delete().in('id', emptyIds);
    if (deleteError) {
        console.error('Failed to prune empty sessions:', deleteError.message);
    }
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

// Phase 3C.2: Fetch the rolling conversation working context
async function getWorkingContext(sessionId) {
    if (!sessionId) return {};
    const { data, error } = await supabase
        .from('sessions')
        .select('working_context')
        .eq('id', sessionId)
        .single();
    
    if (error) {
        console.error('Failed to load working context:', error.message);
        return {};
    }
    return data?.working_context || {};
}

// Phase 3C.2: Atomically merge a rolling conversation working-context delta.
//
// IMPORTANT:
// Callers must provide only the changes they want to make.
// They must NOT read working_context, merge locally, and write the
// resulting snapshot back.
//
// The database owns the canonical merge so concurrent background
// tasks cannot overwrite each other's context updates.
async function mergeWorkingContext(sessionId, contextDelta) {
    if (!sessionId) {
        return {};
    }

    if (
        !contextDelta ||
        typeof contextDelta !== 'object' ||
        Array.isArray(contextDelta)
    ) {
        console.warn(
            '[SessionManager] Ignoring invalid working-context delta.'
        );

        return {};
    }

    if (Object.keys(contextDelta).length === 0) {
        return await getWorkingContext(sessionId);
    }

    const { data, error } = await supabase.rpc(
        'merge_session_working_context',
        {
            p_session_id: sessionId,
            p_delta: contextDelta
        }
    );

    if (error) {
        console.error(
            '[SessionManager] Failed to merge working context:',
            error.message
        );

        return {};
    }

    return data || {};
}

module.exports = {
    startSession,
    getCurrentSession,
    endSession,
    listSessions,
    getSessionMessages,
    deleteSession,
    renameSession,
    pruneEmptySessions,
    getWorkingContext,
    mergeWorkingContext
};
