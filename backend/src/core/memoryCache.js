// backend/src/core/memoryCache.js
const longTermProfile = require('../memory/longTermProfile');
const projectMemory = require('../memory/projectMemory');
const knowledgeLibrary = require('../memory/knowledgeLibrary');
const proceduralMemory = require('../memory/proceduralMemory');
const devState = require('../memory/devState');

const warmIndex = {};
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
        dev_state: []
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

async function getMemory(store) {
    const now = Date.now();
    
    if (!warmIndex[store]) {
        console.time(`[MemoryCache] Fetch ${store}`);
        let data = [];
        try {
            switch(store) {
                case 'user_profile': data = await longTermProfile.get(); break;
                case 'project_memory': data = await projectMemory.get(); break;
                case 'knowledge_library': data = await knowledgeLibrary.getAll(); break;
                case 'procedural_memory': data = await proceduralMemory.getAll(); break;
                case 'dev_state': data = await devState.getAll(); break;
            }
            
            warmIndex[store] = data.map(d => ({
                id: d.id || `${store}_${d.key || d.subject || Math.random()}`,
                data: d,
                score: 0,
                lastAccessed: now,
                accessCount: 0,
                activationReason: "Loaded from COLD storage"
            }));
            console.log(`[MemoryCache] ✅ Indexed ${warmIndex[store].length} items for ${store}`);
        } catch (e) {
            console.error(`[MemoryCache] Failed to fetch ${store} from COLD storage:`, e.message);
        }
        console.timeEnd(`[MemoryCache] Fetch ${store}`);
    } else {
        warmIndex[store].forEach(item => applyDecay(item, now));
    }
    
    return warmIndex[store];
}

function boostItem(store, itemId, amount, reason) {
    const item = warmIndex[store]?.find(i => i.id === itemId);
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
    if (warmIndex[store]) {
        delete warmIndex[store];
    }
}

function clearCache(store = null) {
    if (store) {
        delete warmIndex[store];
    } else {
        for (const key in warmIndex) delete warmIndex[key];
    }
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