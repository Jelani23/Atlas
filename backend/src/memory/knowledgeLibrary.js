const supabase = require('../database/supabaseClient');

/**
 * ============================================================
 * KNOWLEDGE MEMORY STORAGE
 * ============================================================
 *
 * Knowledge memory is Alice's persistent structured internal
 * knowledge base: durable facts, definitions, concepts,
 * relationships, observations, claims, assumptions, and hypotheses
 * acquired from conversation, search, documents, tools, model
 * knowledge, or Alice's own reasoning.
 *
 * Knowledge is represented using layered semantic identifiers,
 * following the same pattern already established by
 * proceduralMemory.js and projectMemory.js:
 *
 *   category   broad knowledge domain (science, technology, ...)
 *   subject    the entity/concept the knowledge is about (earth, python, ...)
 *   key        the specific property/relationship/fact (creator, orbital_period, ...)
 *
 * The canonical identity is:
 *
 *   category + subject + key
 *
 * topics are retrieval metadata and are NOT part of identity - two
 * records with the same (category, subject, key) but different
 * topics are the SAME knowledge record, not two.
 *
 * type describes the semantic nature of the knowledge (fact,
 * definition, concept, relationship, observation, claim, assumption,
 * hypothesis, ...) - intentionally a free-form column rather than a
 * hard-coded enum, so new types don't require another migration; see
 * KNOWN_KNOWLEDGE_TYPES below for the recommended vocabulary.
 *
 * source / source_type carry provenance - source_type is the
 * acquisition mechanism (user_statement, conversation, web_search,
 * document, tool, model_knowledge, reasoning, ...), source is a
 * pointer to the specific origin (a URL, a short description, etc.),
 * not the payload itself.
 *
 * This module is intentionally limited to storage/retrieval. It does
 * NOT decide whether something is knowledge, does not classify it,
 * and does not run any LLM reasoning - that all belongs upstream
 * (eligibility, the extractor, semantic enrichment). Canonical
 * identity resolution, validation, and deduplication checks are all
 * deterministic here, same as the rest of the memory system.
 *
 * ============================================================
 */

// Recommended vocabulary for `type` - not enforced as a hard
// constraint (the plan is explicit: don't hard-code an inflexible
// enumeration if it would make the system brittle). Anything not in
// this list is still accepted; this only feeds sensible defaulting
// and is available for callers that want to validate against it.
const KNOWN_KNOWLEDGE_TYPES = [
    'fact',
    'definition',
    'concept',
    'relationship',
    'observation',
    'claim',
    'assumption',
    'hypothesis'
];

const KNOWN_SOURCE_TYPES = [
    'user_statement',
    'conversation',
    'web_search',
    'document',
    'tool',
    'model_knowledge',
    'reasoning'
];

function normalizeSlug(value, fallback) {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

    return normalized || fallback;
}

function normalizeTopics(topics) {
    if (!Array.isArray(topics)) {
        return [];
    }

    return [
        ...new Set(
            topics
                .map(topic => normalizeSlug(topic, ''))
                .filter(Boolean)
        )
    ];
}

const SELECT_COLUMNS = `
    id,
    category,
    subject,
    topics,
    type,
    key,
    value,
    confidence,
    source,
    source_type,
    created_at,
    updated_at
`;

function validateKnowledgeIdentity(memoryData) {
    if (!memoryData) {
        throw new Error('Knowledge memory data is required.');
    }

    if (!memoryData.key || !String(memoryData.key).trim()) {
        throw new Error('Knowledge memory requires a key.');
    }

    if (memoryData.value === undefined || memoryData.value === null || memoryData.value === '') {
        throw new Error('Knowledge memory requires a value.');
    }
}

/**
 * Normalize a raw candidate into the exact row shape stored in
 * knowledge_library. Centralized here so addKnowledge/updateKnowledge
 * /upsertKnowledge can't drift apart on defaulting rules.
 */
function buildRow(memoryData) {
    validateKnowledgeIdentity(memoryData);

    return {
        category: normalizeSlug(memoryData.category, 'general'),
        subject: normalizeSlug(memoryData.subject, 'general'),
        topics: normalizeTopics(memoryData.topics),
        type: normalizeSlug(memoryData.type, 'fact'),
        key: normalizeSlug(memoryData.key, memoryData.key),
        value: memoryData.value,
        confidence: memoryData.confidence ?? 1.0,
        source: memoryData.source || null,
        source_type: normalizeSlug(memoryData.source_type, 'conversation')
    };
}

/**
 * ------------------------------------------------------------
 * ADD KNOWLEDGE (insert)
 * ------------------------------------------------------------
 * Canonicalization/deduplication decisions (does this identity
 * already exist? does the value materially differ?) should happen
 * before this is called - see memoryDeduplicator.js and
 * memoryManager.js. This is a plain insert and will fail on a
 * uniqueness conflict rather than silently overwriting; callers that
 * want insert-or-refresh semantics should use upsertKnowledge.
 * ------------------------------------------------------------
 */
async function addKnowledge(memoryData) {
    const row = buildRow(memoryData);

    const { error } = await supabase
        .from('knowledge_library')
        .insert(row);

    if (error) {
        throw new Error(`Failed to save knowledge: ${error.message}`);
    }

    return true;
}

/**
 * ------------------------------------------------------------
 * UPDATE KNOWLEDGE
 * ------------------------------------------------------------
 * Updates the record at an existing canonical identity. Throws if no
 * row matches - callers that aren't sure whether the identity exists
 * yet should use upsertKnowledge instead.
 * ------------------------------------------------------------
 */
async function updateKnowledge(memoryData) {
    const row = buildRow(memoryData);

    const { data, error } = await supabase
        .from('knowledge_library')
        .update({
            topics: row.topics,
            type: row.type,
            value: row.value,
            confidence: row.confidence,
            source: row.source,
            source_type: row.source_type,
            updated_at: new Date().toISOString()
        })
        .eq('category', row.category)
        .eq('subject', row.subject)
        .eq('key', row.key)
        .select()
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to update knowledge: ${error.message}`);
    }

    if (!data) {
        throw new Error('Knowledge update matched no existing record.');
    }

    return true;
}

/**
 * ------------------------------------------------------------
 * UPSERT KNOWLEDGE (insert OR refresh)
 * ------------------------------------------------------------
 * Native Postgres INSERT ... ON CONFLICT DO UPDATE on the
 * (category, subject, key) unique constraint, the same pattern
 * projectMemory.js already uses. This is the primary entry point
 * memoryManager.js calls for insert/update/duplicate-refresh alike:
 * a true duplicate (same value) still needs its confidence/source/
 * updated_at refreshed per the plan (§6 "DUPLICATE / REFRESH"), and
 * a changed value needs the row updated (§6 "UPDATE") - both are the
 * same SQL operation here, just with different resulting values, so
 * there's no reason to force two different code paths above this
 * for what is structurally one deterministic write.
 * ------------------------------------------------------------
 */
async function upsertKnowledge(memoryData) {
    const row = buildRow(memoryData);

    const { error } = await supabase
        .from('knowledge_library')
        .upsert(
            {
                ...row,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'category,subject,key' }
        );

    if (error) {
        throw new Error(`Failed to save knowledge: ${error.message}`);
    }

    return true;
}

/**
 * ------------------------------------------------------------
 * FIND BY CANONICAL IDENTITY
 * ------------------------------------------------------------
 * Canonical knowledge identity: category + subject + key.
 * This is the ONLY lookup memoryManager.js should use to decide
 * insert vs. update vs. duplicate - never raw value/topic matching.
 * ------------------------------------------------------------
 */
async function find(category, subject, key) {
    if (!category || !subject || !key) {
        return null;
    }

    const { data, error } = await supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .eq('category', normalizeSlug(category, 'general'))
        .eq('subject', normalizeSlug(subject, 'general'))
        .eq('key', normalizeSlug(key, key))
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to find knowledge memory: ${error.message}`);
    }

    return data || null;
}

/**
 * ------------------------------------------------------------
 * TARGETED RETRIEVAL
 * ------------------------------------------------------------
 * The whole point of structured knowledge is that it does NOT all
 * get loaded into context at once (plan §13) - these let callers
 * pull only what's relevant to the current category/subject/topics
 * instead of scanning getAll()'s full result themselves.
 * ------------------------------------------------------------
 */

async function getByCategory(category) {
    if (!category) {
        return [];
    }

    const { data, error } = await supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .eq('category', normalizeSlug(category, 'general'))
        .order('updated_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to load knowledge by category: ${error.message}`);
    }

    return data || [];
}

async function getBySubject(category, subject) {
    if (!category || !subject) {
        return [];
    }

    const { data, error } = await supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .eq('category', normalizeSlug(category, 'general'))
        .eq('subject', normalizeSlug(subject, 'general'))
        .order('updated_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to load knowledge by subject: ${error.message}`);
    }

    return data || [];
}

async function getByTopics(topics = [], category = null) {
    const normalizedTopics = normalizeTopics(topics);

    if (normalizedTopics.length === 0) {
        return [];
    }

    let query = supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .overlaps('topics', normalizedTopics);

    if (category) {
        query = query.eq('category', normalizeSlug(category, 'general'));
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to load knowledge by topics: ${error.message}`);
    }

    return data || [];
}

/**
 * ------------------------------------------------------------
 * GET ALL
 * ------------------------------------------------------------
 * Retained for administrative/debugging use and as the source feed
 * for memoryCache's warm index (see core/memoryCache.js) - the cache
 * layer, not this module, is what makes repeated getAll() calls
 * cheap. Targeted retrieval above is what code deciding what to show
 * Alice right now should actually use.
 * ------------------------------------------------------------
 */
async function getAll() {
    const { data, error } = await supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Failed to load knowledge library:', error.message);
        return [];
    }

    return data || [];
}

/**
 * ------------------------------------------------------------
 * SEARCH (legacy free-text; used by tools/memory/searchKnowledge.js)
 * ------------------------------------------------------------
 * Kept for the existing search-tool intent - now also matches
 * against category and type, since those are meaningful retrieval
 * dimensions that didn't exist on the old minimal schema.
 * ------------------------------------------------------------
 */
async function search(query) {
    const pattern = `%${query}%`;

    const { data, error } = await supabase
        .from('knowledge_library')
        .select(SELECT_COLUMNS)
        .or(
            `subject.ilike.${pattern},key.ilike.${pattern},value.ilike.${pattern},category.ilike.${pattern},type.ilike.${pattern}`
        );

    if (error) {
        console.error('Failed to search knowledge library:', error.message);
        return [];
    }

    return data || [];
}

/**
 * ------------------------------------------------------------
 * GET CONTEXT STRING
 * ------------------------------------------------------------
 * LEGACY / TRANSITIONAL. getAll() -> flat string is exactly the
 * "giant context dump" the plan says knowledge must not become
 * (§13) - this remains only for compatibility with call sites that
 * still expect a complete-library string, and should be replaced by
 * targeted retrieval (getByCategory/getBySubject/getByTopics) over
 * time, same as procedural_memory's getContextString().
 * ------------------------------------------------------------
 */
async function getContextString() {
    const memories = await getAll();

    if (!memories.length) {
        return '';
    }

    return memories
        .map(memory => {
            const topics =
                Array.isArray(memory.topics) && memory.topics.length > 0
                    ? ` | topics: ${memory.topics.join(', ')}`
                    : '';

            return (
                `- [${memory.category}/${memory.subject}/${memory.key}] ` +
                `${memory.value}${topics}`
            );
        })
        .join('\n');
}

module.exports = {
    addKnowledge,
    updateKnowledge,
    upsertKnowledge,
    find,
    getByCategory,
    getBySubject,
    getByTopics,
    getAll,
    search,
    getContextString,
    normalizeTopics,
    KNOWN_KNOWLEDGE_TYPES,
    KNOWN_SOURCE_TYPES
};
