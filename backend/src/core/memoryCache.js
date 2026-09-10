// backend/src/core/memoryCache.js
const longTermProfile = require('../memory/longTermProfile');
const projectMemory = require('../memory/projectMemory');
const knowledgeLibrary = require('../memory/knowledgeLibrary');
const proceduralMemory = require('../memory/proceduralMemory');
const devState = require('../memory/devState');
const reflectionJournal = require('../memory/reflectionJournal');

const warmCache = require('./generationCache').createGenerationCache();
const hotState = {
    activeProject: null,
    activeFiles: [],
    currentTask: null,
    cacheKey: null,

    // Fast-access memory cache
    memories: {
        user_profile: [],
        project_memory: [],
        knowledge_library: [],
        procedural_memory: [],
        dev_state: [],
        reflections: [],
        conversation_history: []
    },

    lastUpdated: null
};

const DECAY_RATE_PER_MS = 5 / (60 * 60 * 1000); 

function applyDecay(item, now) {
    const timeSinceAccess = now - item.lastAccessed;
    item.score -= (timeSinceAccess * DECAY_RATE_PER_MS);
    if (item.score < 0) item.score = 0;
    return item;
}

async function loadMemoryIndex(store) {
    const started = Date.now();
    let data = [];
    try {
        switch(store) {
            case 'user_profile': data = await longTermProfile.get(); break;
            case 'project_memory': data = await projectMemory.get(); break;
            case 'knowledge_library': data = await knowledgeLibrary.getAll(); break;
            case 'procedural_memory': data = await proceduralMemory.getAll(); break;
            case 'dev_state': data = await devState.getAll(); break;
            case 'reflections': data = await reflectionJournal.getAll(); break;
        }
        const loadedAt = Date.now();
        const indexed = data.map(d => ({
            id: d.id || `${store}_${d.project_key || d.subject || 'global'}_${d.key || 'unknown'}`,
            data: d, score: 0, lastAccessed: loadedAt, accessCount: 0,
            activationReason: "Loaded from COLD storage"
        }));
        console.log(`[MemoryCache] Loaded ${indexed.length} items for ${store}`);
        return indexed;
    } catch (e) {
        console.error(`[MemoryCache] Failed to fetch ${store} from COLD storage:`, e.message);
        throw e;
    } finally {
        console.log(`[MemoryCache] Fetch ${store}: ${Date.now() - started}ms`);
    }
}

async function getMemory(store) {
    const cached = warmCache.peek(store);
    if (!cached) return warmCache.get(store, () => loadMemoryIndex(store));
    cached.forEach(item => applyDecay(item, Date.now()));
    return cached;
}

function boostItem(store, itemId, amount, reason) {
    const item = warmCache.peek(store)?.find(i => i.id === itemId);
    if (item) {
        item.score += amount;
        item.lastAccessed = Date.now();
        item.accessCount++;
        item.activationReason = reason;
    }
}

// Selective invalidation. When memoryManager saves new data, it calls this.
// It wipes the RAM cache for that specific store so the next read gets the fresh DB data.
function invalidate(store) {
    warmCache.invalidate(store);

    // Warm and hot are two views of the same underlying store. Leaving the
    // previously selected hot rows in place after a write makes callers see
    // stale data until a later context build happens to overwrite them.
    if (Object.prototype.hasOwnProperty.call(hotState.memories, store)) {
        hotState.memories[store] = [];
    }
    hotState.lastUpdated = null;
}

function clearCache(store = null) {
    if (store) {
        warmCache.invalidate(store);
        if (Object.prototype.hasOwnProperty.call(hotState.memories, store)) {
            hotState.memories[store] = [];
        }
    } else {
        warmCache.clear();
        for (const key of Object.keys(hotState.memories)) {
            hotState.memories[key] = [];
        }
    }
    hotState.lastUpdated = null;
}

function setHotState(key, value) {
    hotState[key] = value;
}

function getHotState() {
    return hotState;
}

function setHotMemory(store, items) {
    if (!hotState.memories[store]) {
        hotState.memories[store] = [];
    }

    hotState.memories[store] = Array.isArray(items) ? [...items] : [];
    hotState.lastUpdated = Date.now();
}

function getHotMemory(store) {
    return hotState.memories[store] || [];
}

function isHotCacheValid(cacheKey) {
    if (!hotState.cacheKey) return false;
    if (!hotState.lastUpdated) return false;

    return hotState.cacheKey === cacheKey;
}

module.exports = {
    getMemory,
    clearCache,
    invalidate,
    setHotState,
    getHotState,
    setHotMemory,
    getHotMemory,
    isHotCacheValid,
    boostItem
};
