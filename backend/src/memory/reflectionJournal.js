const supabase = require('../database/supabaseClient');

const STRUCTURED_COLUMNS =
    'id, session_id, category, subject, topics, summary, confidence, timestamp, ' +
    'anchors, decisions, comparisons, open_loops, schema_version, source_message_count';
const LEGACY_COLUMNS =
    'id, session_id, category, subject, topics, summary, confidence, timestamp';

function rowFromEntry(entry) {
    return {
        session_id: entry.sessionId || null,
        category: entry.category || 'general',
        subject: entry.subject || 'general',
        topics: Array.isArray(entry.topics) ? entry.topics : [],
        summary: entry.summary,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 1.0,
        anchors: Array.isArray(entry.anchors) ? entry.anchors : [],
        decisions: Array.isArray(entry.decisions) ? entry.decisions : [],
        comparisons: Array.isArray(entry.comparisons) ? entry.comparisons : [],
        open_loops: Array.isArray(entry.openLoops) ? entry.openLoops : [],
        schema_version: Number(entry.schemaVersion) || 1,
        source_message_count: Number(entry.sourceMessageCount) || null,
        timestamp: new Date().toISOString()
    };
}

function isLegacySchemaError(error) {
    return !!error && /anchors|decisions|comparisons|open_loops|schema_version|source_message_count/i
        .test(error.message || '');
}

function legacyRow(row) {
    const {
        anchors,
        decisions,
        comparisons,
        open_loops,
        schema_version,
        source_message_count,
        ...legacy
    } = row;
    return legacy;
}

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
    const row = rowFromEntry(entry);
    let { error } = await supabase
        .from('reflections')
        .insert(row);

    if (isLegacySchemaError(error)) {
        ({ error } = await supabase.from('reflections').insert(legacyRow(row)));
    }

    if (error) {
        throw new Error(`Failed to save reflection: ${error.message}`);
    }
    return true;
}

async function replace(entry) {
    const row = rowFromEntry(entry);
    const sessionId = entry.sessionId;
    const { timestamp, session_id, ...updates } = row;
    let { error } = await supabase
        .from('reflections')
        .update(updates)
        .eq('session_id', sessionId);

    if (isLegacySchemaError(error)) {
        ({ error } = await supabase
            .from('reflections')
            .update(legacyRow(updates))
            .eq('session_id', sessionId));
    }

    if (error) {
        throw new Error(`Failed to replace reflection: ${error.message}`);
    }
    return true;
}

async function getForSession(sessionId) {
    if (!sessionId) return null;

    let { data, error } = await supabase
        .from('reflections')
        .select(STRUCTURED_COLUMNS)
        .eq('session_id', sessionId)
        .maybeSingle();

    if (isLegacySchemaError(error)) {
        ({ data, error } = await supabase
            .from('reflections')
            .select(LEGACY_COLUMNS)
            .eq('session_id', sessionId)
            .maybeSingle());
    }

    if (error) {
        throw new Error(`Failed to load reflection: ${error.message}`);
    }
    return data || null;
}

// Dedup guard - checked by reflectionEngine.js before generating, and
// backstopped by the partial unique index on session_id (see
// migrations/002_reflections_upgrade.sql) against a race between two
// triggers reflecting on the same outgoing session.
async function hasReflection(sessionId) {
    if (!sessionId) return false;
    try {
        return !!(await getForSession(sessionId));
    } catch (error) {
        console.error('Failed to check existing reflection:', error.message);
        return false;
    }
}

async function getRecent(limit = 1) {
    let { data, error } = await supabase
        .from('reflections')
        .select(STRUCTURED_COLUMNS)
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (isLegacySchemaError(error)) {
        ({ data, error } = await supabase
            .from('reflections')
            .select(LEGACY_COLUMNS)
            .order('timestamp', { ascending: false })
            .limit(limit));
    }

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
    let { data, error } = await supabase
        .from('reflections')
        .select(STRUCTURED_COLUMNS)
        .order('timestamp', { ascending: false });

    if (isLegacySchemaError(error)) {
        ({ data, error } = await supabase
            .from('reflections')
            .select(LEGACY_COLUMNS)
            .order('timestamp', { ascending: false }));
    }

    if (error) {
        console.error('Failed to load reflections for cache:', error.message);
        return [];
    }

    return data;
}

module.exports = { append, replace, getForSession, getRecent, getAll, hasReflection };
