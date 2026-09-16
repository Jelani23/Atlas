const supabase = require('../database/supabaseClient');

function historyReadError(cause) {
    const error = new Error('Conversation history could not be loaded.', { cause });
    error.code = 'HISTORY_UNAVAILABLE';
    return error;
}

async function readHistoryQuery(query) {
    try {
        const { data, error } = await query;
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Invalid history response');
        return data;
    } catch (error) {
        throw historyReadError(error);
    }
}

/**
 * ============================================================
 * WORKING MEMORY (chat log access layer)
 * ============================================================
 *
 * `conversations` is the canonical historical record of what was
 * actually said - see database/migrations/003_conversations_upgrade.sql
 * for the topics/project_key/importance columns this module now
 * populates and queries.
 *
 * IMPORTANT distinction (plan §5/§9): this module is the chat log AND
 * the source for short-term/recent context (getHistory) - both read the
 * same canonical table, just with different query shapes (recent-N vs
 * topic/project-scoped). Neither is a second source of truth; there is
 * exactly one table.
 * ============================================================
 */

async function append(message, sessionId) {
    if (!sessionId) {
        throw new Error("No active session.");
    }

    const { data, error } = await supabase
        .from('conversations')
        .insert({
            session_id: sessionId,
            role: message.role,
            content: message.content
        })
        .select('id')
        .single();

    if (error) {
        throw new Error(`Failed to append to working memory: ${error.message}`);
    }

    return data.id;
}

// Attaches deterministic retrieval metadata to a message row after the
// fact - called from conversationEngine.js's background extraction task,
// once topics/project/importance are already known from that pass. This
// intentionally never triggers its own LLM call (plan §4) - it reuses
// whatever extraction already computed for that turn.
async function tagMessage(messageId, { topics = [], projectKey = null, importance = 0 } = {}) {
    if (!messageId) return;

    const { error } = await supabase
        .from('conversations')
        .update({
            topics,
            project_key: projectKey,
            importance
        })
        .eq('id', messageId);

    if (error) {
        console.error('Failed to tag conversation message:', error.message);
    }
}

async function getHistory(sessionId, limit = 20) {
    if (!sessionId) {
        return [];
    }

    const data = await readHistoryQuery(supabase
        .from('conversations')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('id', { ascending: false })
        .limit(limit));

    return data.reverse();
}

// Retrieves older-but-relevant messages by topic/project overlap rather
// than recency alone (plan §10's retrieval goal). Deliberately separate
// from getHistory() - this is NOT part of the default per-turn context
// build (that stays recency-based via getHistory), it's a targeted
// lookup for when the context system needs to reach further back than
// the last N messages.
//
// crossSession=false (default) scopes to the current conversation only -
// "what did we say earlier in THIS conversation about X". Set true to
// search across all past conversations for the given project.
async function getRelevant(keywords, { sessionId = null, projectKey = null, crossSession = false, limit = 10 } = {}) {
    const keywordList = keywords instanceof Set ? Array.from(keywords) : (keywords || []);
    if (keywordList.length === 0) return [];

    let query = supabase
        .from('conversations')
        .select('id, session_id, role, content, topics, project_key, importance, timestamp')
        .overlaps('topics', keywordList)
        .order('importance', { ascending: false })
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (!crossSession && sessionId) {
        query = query.eq('session_id', sessionId);
    }
    if (projectKey) {
        query = query.eq('project_key', projectKey);
    }

    return readHistoryQuery(query);
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
    tagMessage,
    getHistory,
    getRelevant,
    clear
};
