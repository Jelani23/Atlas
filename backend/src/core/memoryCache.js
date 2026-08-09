const longTermProfile = require('../memory/longTermProfile');
const projectMemory = require('../memory/projectMemory');
const knowledgeLibrary = require('../memory/knowledgeLibrary');
const proceduralMemory = require('../memory/proceduralMemory');
const devState = require('../memory/devState');

// WARM INDEX: Stores items with their activation metadata in RAM.
// Format: { [store]: [ { id, data, score, lastAccessed, accessCount, activationReason } ] }
const warmIndex = {};

// HOT STATE: Instant RAM variables for the current active context
const hotState = {
    activeProject: null,
    activeFiles: [],
    currentTask: null
};

// Decay rate: Lose 5 points per hour of inactivity.
const DECAY_RATE_PER_MS = 5 / (60 * 60 * 1000); 

function applyDecay(item, now) {
    const timeSinceAccess = now - item.lastAccessed;
    item.score -= (timeSinceAccess * DECAY_RATE_PER_MS);
    if (item.score < 0) item.score = 0;
    return item;
}

async function getMemory(store) {
    const now = Date.now();
    
    // If not in WARM index, fetch from COLD (Supabase)
    if (!warmIndex[store]) {
        // console.log(`[MemoryCache] 🧊 COLD fetch for ${store}...`);
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
            
            // Initialize in WARM index with a base score of 0 (COLD in RAM)
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
        // Apply decay to existing items so their score drops over time
        warmIndex[store].forEach(item => applyDecay(item, now));
    }
    
    return warmIndex[store];
}

// Event-driven promotion
function boostItem(store, itemId, amount, reason) {
    const item = warmIndex[store]?.find(i => i.id === itemId);
    if (item) {
        item.score += amount;
        item.lastAccessed = Date.now();
        item.accessCount++;
        item.activationReason = reason;
        
        const state = item.score >= 80 ? '🔥 HOT' : item.score >= 40 ? '🟡 WARM' : '🧊 COLD';
        // Log only significant boosts to avoid console spam
        // if (amount > 10) {
        //     console.log(`[MemoryCache] ${state} Boosted ${store}:${itemId} to ${item.score.toFixed(0)} - Reason: ${reason}`);
        // }
    }
}

function clearCache(store = null) {
    if (store) {
        // console.log(`[MemoryCache] ❄️ Clearing WARM index for ${store}`);
        delete warmIndex[store];
    } else {
        // console.log(`[MemoryCache] ❄️ Clearing all WARM index`);
        for (const key in warmIndex) delete warmIndex[key];
    }
}

function setHotState(key, value) {
    // console.log(`[MemoryCache] 🔥 HOT state updated: ${key} = ${JSON.stringify(value)}`);
    hotState[key] = value;
}

function getHotState() {
    return hotState;
}

module.exports = { getMemory, clearCache, setHotState, getHotState, boostItem };