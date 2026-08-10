// backend/src/core/contextManager.js
const memoryCache = require('./memoryCache');

// --- 1. TOKEN ESTIMATOR ---
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// --- 2. INTENT-BASED CONTEXT PROFILES (OPTIMIZED) ---
const CONTEXT_PROFILES = {
    conversation: { personal: 200, project: 0,  knowledge: 0,  procedures: 100, devState: 0 },
    action:       { personal: 0,  project: 0, knowledge: 0,  procedures: 0, devState: 0 },
    coding:       { personal: 0,  project: 500, knowledge: 0,  procedures: 200, devState: 0 },
    planning:     { personal: 0,  project: 300, knowledge: 100,  procedures: 200, devState: 100 },
    search:       { personal: 0,  project: 0,  knowledge: 0,  procedures: 0, devState: 0 },
    memory:       { personal: 1500, project: 300, knowledge: 200, procedures: 200, devState: 100 } // Used for isAskingAboutSelf
};

// --- 3. BUDGET ALLOCATOR ---
function allocateBudget(items, budget) {
    const selected = [];
    let used = 0;
    
    const sorted = items.sort((a, b) => b._finalScore - a._finalScore);
    
    for (const item of sorted) {
        const text = `${item.key || ''} ${item.value || ''} ${item.subject || ''} ${item.trigger || ''} ${item.action || ''} ${item.feature || ''} ${item.status || ''}`;
        const tokens = estimateTokens(text);
        
        if (used + tokens <= budget) {
            selected.push(item);
            used += tokens;
        }
    }
    
    return { selected, usedTokens: used };
}

function extractKeywords(text) {
    if (!text) return new Set();
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'in', 'on', 'for', 'with', 'about', 'can', 'you', 'me', 'my', 'i', 'it', 'this', 'that']);
    return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
}

function scoreAndBoost(store, item, keywords) {
    let relevanceScore = 0;
    const d = item.data;
    const itemText = `${d.key || ''} ${d.value || ''} ${d.subject || ''} ${d.trigger || ''} ${d.action || ''} ${d.feature || ''} ${d.status || ''}`.toLowerCase();
    
    keywords.forEach(kw => {
        if (itemText.includes(kw)) relevanceScore += 25;
        if (itemText.split(/\s+/).some(word => word.includes(kw))) relevanceScore += 10;
    });
    
    if (relevanceScore > 0) {
        memoryCache.boostItem(store, item.id, relevanceScore, "Referenced in current task");
    }
    
    const finalScore = (item.score * 0.4) + (relevanceScore * 0.6);
    return { ...d, _activationScore: item.score, _relevanceScore: relevanceScore, _finalScore: finalScore };
}

async function getRelevantContext(userInput, history, intent) {
    console.time("[ContextManager] Total Processing");
    const recentHistoryStr = history.slice(-5).map(m => m.content).join(' ');
    const keywords = extractKeywords(userInput + ' ' + recentHistoryStr);

    const [personalIdx, projectsIdx, knowledgeIdx, featuresIdx, proceduresIdx] = await Promise.all([
        memoryCache.getMemory('user_profile'),
        memoryCache.getMemory('project_memory'),
        memoryCache.getMemory('knowledge_library'),
        memoryCache.getMemory('dev_state'),
        memoryCache.getMemory('procedural_memory')
    ]);

    const lowerInput = userInput.toLowerCase();
    const isAskingAboutSelf = lowerInput.includes('know about me') || lowerInput.includes('what do you remember') || lowerInput.includes('who am i') || lowerInput.includes('what do you know');
    const isAskingAboutAtlas = lowerInput.includes('what are you') || lowerInput.includes('what can you do') || lowerInput.includes('know about atlas');

    let personalScored = personalIdx.map(item => scoreAndBoost('user_profile', item, keywords))
        .filter(m => m._relevanceScore > 0 || personalIdx.length <= 3 || isAskingAboutSelf);
        
    let projectScored = projectsIdx.map(item => scoreAndBoost('project_memory', item, keywords))
        .filter(m => m._relevanceScore > 0 || projectsIdx.length <= 3 || isAskingAboutSelf);
        
    let knowledgeScored = knowledgeIdx.map(item => scoreAndBoost('knowledge_library', item, keywords))
        .filter(k => k._relevanceScore > 0 || knowledgeIdx.length <= 3);
        
    let proceduresScored = proceduresIdx.map(item => scoreAndBoost('procedural_memory', item, keywords))
        .filter(p => p._relevanceScore > 0 || proceduresIdx.length <= 5);

    const isDevRelevant = intent.action || intent.coding || intent.planning || isAskingAboutAtlas || isAskingAboutSelf || keywords.has('feature') || keywords.has('state');
    let devScored = isDevRelevant ? featuresIdx.map(item => scoreAndBoost('dev_state', item, keywords)).filter(f => f._relevanceScore > 0 || featuresIdx.length <= 5) : [];

    const profileName = isAskingAboutSelf ? 'memory' : intent.intent;
    const budgetProfile = CONTEXT_PROFILES[profileName] || CONTEXT_PROFILES.conversation;

    const personalAlloc = allocateBudget(personalScored, budgetProfile.personal);
    const projectAlloc = allocateBudget(projectScored, budgetProfile.project);
    const knowledgeAlloc = allocateBudget(knowledgeScored, budgetProfile.knowledge);
    const proceduresAlloc = allocateBudget(proceduresScored, budgetProfile.procedures);
    const devAlloc = allocateBudget(devScored, budgetProfile.devState);

    console.timeEnd("[ContextManager] Total Processing");

    const totalUsed = personalAlloc.usedTokens + projectAlloc.usedTokens + knowledgeAlloc.usedTokens + proceduresAlloc.usedTokens + devAlloc.usedTokens;
    const manifest = {
        task: profileName,
        allocations: {
            personal: personalAlloc.usedTokens,
            projects: projectAlloc.usedTokens,
            knowledge: knowledgeAlloc.usedTokens,
            procedures: proceduresAlloc.usedTokens,
            devState: devAlloc.usedTokens
        },
        selected: {
            personal: personalAlloc.selected.length,
            projects: projectAlloc.selected.length,
            knowledge: knowledgeAlloc.selected.length,
            procedures: proceduresAlloc.selected.length,
            devState: devAlloc.selected.length
        },
        totalUsed: totalUsed
    };
    
    console.log(`[ContextManager] 📊 Context Manifest (Task: ${manifest.task}) - Used ${totalUsed} tokens`);
    console.log(`   Personal: ${manifest.selected.personal} items (${manifest.allocations.personal}t) | Projects: ${manifest.selected.projects} items (${manifest.allocations.projects}t) | Proc: ${manifest.selected.procedures} items (${manifest.allocations.procedures}t)`);

    return {
        hotState: memoryCache.getHotState(),
        personal: personalAlloc.selected,
        projects: projectAlloc.selected,
        knowledge: knowledgeAlloc.selected,
        procedures: proceduresAlloc.selected,
        features: devAlloc.selected,
        manifest
    };
}

module.exports = { getRelevantContext };