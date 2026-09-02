const DISABLED_VALUES = new Set(['false', 'disabled', 'off', '0']);

function isSearchKnowledgePersistenceEnabled(value = process.env.SEARCH_KNOWLEDGE_PERSISTENCE) {
    const configured = String(value ?? '').trim().toLowerCase();
    return !DISABLED_VALUES.has(configured);
}

module.exports = { isSearchKnowledgePersistenceEnabled };
