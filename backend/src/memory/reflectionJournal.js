const supabase = require('../database/supabaseClient');

/**
 * ============================================================
 * REFLECTION JOURNAL
 * ============================================================
 *
 * Reflections are distinct from knowledge_library on purpose:
 *
 *   knowledge_library = durable, individually-addressable facts about
 *   the world/project, identified by (category, subject, key).
 *
 *   reflections = one row per conversation SESSION - a compact summary
 *   of what happened in that session, written for Alice's own future
 *   contextual understanding rather than as a standalone fact. There
 *   is no key/value here; the unit of identity is the session itself.
 *
 * category/subject/topics follow the same layered-identifier
 * convention already established by knowledge_library/procedural_memory,
 * so contextManager.js can retrieve reflections through the same
 * deterministic keyword/topic-overlap scoring used for every other
 * memory store - but they are retrieval metadata only, not a claim
 * that a reflection is a fact.
 * ============================================================
 */

async function append(entry) {
    const { error } = await supabase
        .from('reflections')
        .insert({
            session_id: entry.sessionId || null,
            category: entry.category || 'general',
            subject: entry.subject || 'general',
            topics: Array.isArray(entry.topics) ? entry.topics : [],
            summary: entry.summary,
            confidence: typeof entry.confidence === 'number' ? entry.confidence : 1.0,
            timestamp: new Date().toISOString()
        });

    if (error) {
        throw new Error(`Failed to save reflection: ${error.message}`);
    }
    return true;
}

// Dedup guard - checked by reflectionEngine.js before generating, and
// backstopped by the partial unique index on session_id (see
// migrations/002_reflections_upgrade.sql) against a race between two
// triggers reflecting on the same outgoing session.
async function hasReflection(sessionId) {
    if (!sessionId) return false;

    const { data, error } = await supabase
        .from('reflections')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1);

    if (error) {
        console.error('Failed to check existing reflection:', error.message);
        return false;
    }

    return Array.isArray(data) && data.length > 0;
}

async function getRecent(limit = 1) {
    const { data, error } = await supabase
        .from('reflections')
        .select('session_id, category, subject, topics, summary, confidence, timestamp')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Failed to load reflections:', error.message);
        return [];
    }

    // Old JSON version returned oldest-to-newest for the slice(-limit) it did;
    // match that ordering here since callers read recentReflections[0] as
    // "the most recent one".
    return data;
}

// Full-table load for memoryCache's warmIndex, same shape as
// knowledgeLibrary.getAll()/proceduralMemory.getAll() - contextManager.js
// scores/budgets/decays this in RAM rather than re-querying per turn.
async function getAll() {
    const { data, error } = await supabase
        .from('reflections')
        .select('id, session_id, category, subject, topics, summary, confidence, timestamp')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Failed to load reflections for cache:', error.message);
        return [];
    }

    return data;
}

module.exports = { append, getRecent, getAll, hasReflection };
