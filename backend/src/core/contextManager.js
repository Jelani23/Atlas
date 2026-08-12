// backend/src/core/contextManager.js
const memoryCache = require('./memoryCache');
const hotSwapManager = require('./hotSwapManager');
const projectRegistry = require('../memory/projectRegistry');

// --- 1. TOKEN ESTIMATOR ---
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// --- 2. INTENT-BASED CONTEXT PROFILES (OPTIMIZED) ---
const CONTEXT_PROFILES = {
    conversation: { personal: 600, project: 300,  knowledge: 0,  procedures: 150, devState: 0 },
    action:       { personal: 300, project: 0,    knowledge: 0,  procedures: 0,   devState: 0 },
    coding:       { personal: 300, project: 600,  knowledge: 200, procedures: 200, devState: 100 },
    planning:     { personal: 300, project: 500,  knowledge: 200, procedures: 200, devState: 200 },
    search:       { personal: 200, project: 0,    knowledge: 0,  procedures: 0,   devState: 0 },
    memory:       { personal: 2000, project: 500, knowledge: 500, procedures: 200, devState: 200 }
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
    const isAskingAboutSelf = lowerInput.includes('know about me') || lowerInput.includes('what do you remember') || lowerInput.includes('who am i');
    const isAskingAboutAtlas = lowerInput.includes('what are you') || lowerInput.includes('what can you do') || lowerInput.includes('know about atlas') ;

    // Phase 3C.1: Split State from Profile Essentials
    const stateClasses = ['state'];
    const essentialsClasses = ['identity', 'relationship'];
    
    const stateItems = personalIdx.filter(item => stateClasses.includes(item.data.category));
    const essentials = personalIdx.filter(item => essentialsClasses.includes(item.data.category));
    const dynamicPersonal = personalIdx.filter(item => ![...stateClasses, ...essentialsClasses].includes(item.data.category));

    const stateScored = stateItems.map(item =>
        scoreAndBoost('user_profile', item, keywords)
    );

    // Find the current project pointer.
    // current_project stores the stable project_key.
    const currentStateObj = stateScored.find(
        s => s.key === 'current_project'
    );

    const currentProjectKey =
        currentStateObj?.value?.toLowerCase() || null;

    // Resolve the project key through the project registry.
    // This gives us the authoritative project record.
    const activeProject = currentProjectKey
        ? await projectRegistry.findProjectByKey(currentProjectKey)
        : null;

    // The project subject is kept temporarily for compatibility
    // with the existing project_memory table.
    const currentProjectKeyResolved =
        activeProject?.project_key?.toLowerCase() || null;

    // Determine the current working context.
    const hotState = memoryCache.getHotState();

    const workingContext = {
        activeProject: activeProject?.project_key || null,
        activeProjectName: activeProject?.name || null,
        activeProjectType: activeProject?.project_type || null,
        currentTask: hotState.currentTask || null,
        activeFiles: hotState.activeFiles || []
    };

    const hotContext = hotSwapManager.isContextHot(workingContext);

    console.log(
        `[ContextManager] 🔥 Hot Context: ${hotContext.valid ? 'VALID' : 'STALE'} | ${hotContext.cacheKey}`
    );

    // Establish the current context if the hot cache is stale.
    if (!hotContext.valid) {
        hotSwapManager.activateContext(workingContext);

        const newHotContext = hotSwapManager.isContextHot(workingContext);

        console.log(
            `[ContextManager] 🔄 Hot context activated: ${newHotContext.cacheKey}`
        );
    }

    // Phase 3C.3: Resolve active project memory
    // Project-specific state stays inside project_memory.
    // current_project is only a pointer used to select the active project's memories.
    let activeProjectState = [];

    if (currentProjectKeyResolved) {
        activeProjectState = projectsIdx
            .filter(
                item =>
                    item.data.project_key?.toLowerCase() ===
                    currentProjectKeyResolved
            )
            .map(item =>
                scoreAndBoost(
                    'project_memory',
                    item,
                    keywords
                )
            );
    }

    // 2. Essentials: Score them, force-include up to 300 tokens
    const essentialsScored = essentials.map(item => scoreAndBoost('user_profile', item, keywords));
    const essentialsAlloc = allocateBudget(essentialsScored, 300);

    // 3. Dynamic Personal: Only include if relevant OR if asking about self
    let dynamicPersonalScored = dynamicPersonal.map(item => scoreAndBoost('user_profile', item, keywords))
        .filter(m => m._relevanceScore > 0 || isAskingAboutSelf);
        
    // 4. Projects: Resolve via active project pointer, keyword relevance,
    // or explicit memory/self questions.
    let projectScored = projectsIdx.map(item =>
        scoreAndBoost('project_memory', item, keywords)
    );

    let filteredProjects = projectScored.filter(m => {
        const isActiveProject =
            currentProjectKeyResolved &&
            m.project_key?.toLowerCase() === currentProjectKeyResolved;

        return (
            isActiveProject ||
            m._relevanceScore > 0 ||
            isAskingAboutSelf
        );
    });
        
    let knowledgeScored = knowledgeIdx.map(item => scoreAndBoost('knowledge_library', item, keywords))
        .filter(k => k._relevanceScore > 0 || knowledgeIdx.length <= 3);
        
    let proceduresScored = proceduresIdx.map(item => scoreAndBoost('procedural_memory', item, keywords))
        .filter(p => p._relevanceScore > 0 || proceduresIdx.length <= 5);

    const isDevRelevant = intent.action || intent.coding || intent.planning || isAskingAboutAtlas || isAskingAboutSelf || keywords.has('feature') || keywords.has('state');
    let devScored = isDevRelevant ? featuresIdx.map(item => scoreAndBoost('dev_state', item, keywords)).filter(f => f._relevanceScore > 0 || featuresIdx.length <= 5) : [];

    const profileName = isAskingAboutSelf ? 'memory' : (intent && intent.intent ? intent.intent : 'conversation');
    const budgetProfile = CONTEXT_PROFILES[profileName] || CONTEXT_PROFILES.conversation;

    const remainingPersonalBudget = Math.max(0, budgetProfile.personal - essentialsAlloc.usedTokens);
    const dynamicPersonalAlloc = allocateBudget(dynamicPersonalScored, remainingPersonalBudget);

    const personalAlloc = {
        selected: [...essentialsAlloc.selected, ...dynamicPersonalAlloc.selected],
        usedTokens: essentialsAlloc.usedTokens + dynamicPersonalAlloc.usedTokens
    };

    const projectAlloc = allocateBudget(filteredProjects, budgetProfile.project);
    const knowledgeAlloc = allocateBudget(knowledgeScored, budgetProfile.knowledge);
    const proceduresAlloc = allocateBudget(proceduresScored, budgetProfile.procedures);
    const devAlloc = allocateBudget(devScored, budgetProfile.devState);
    
    // Populate the hot memory cache with the memories that were
    // actually selected as relevant for the current request.
    memoryCache.setHotMemory('user_profile', personalAlloc.selected);
    memoryCache.setHotMemory('project_memory', projectAlloc.selected);
    memoryCache.setHotMemory('knowledge_library', knowledgeAlloc.selected);
    memoryCache.setHotMemory('procedural_memory', proceduresAlloc.selected);
    memoryCache.setHotMemory('dev_state', devAlloc.selected);

    console.log(
    `[ContextManager] 🔥 Hot Cache Updated | ` +
    `Personal: ${personalAlloc.selected.length} | ` +
    `Projects: ${projectAlloc.selected.length} | ` +
    `Knowledge: ${knowledgeAlloc.selected.length} | ` +
    `Procedures: ${proceduresAlloc.selected.length} | ` +
    `DevState: ${devAlloc.selected.length}`
);

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
    console.log(`   State: ${stateScored.length}t | Essentials: ${essentialsAlloc.selected.length}t | Dynamic: ${dynamicPersonalAlloc.selected.length}t | Projects: ${manifest.selected.projects} items | Proc: ${manifest.selected.procedures} items`);

    return {
        hotState: memoryCache.getHotState(),
        state: stateScored,
        personal: personalAlloc.selected,
        projects: projectAlloc.selected,
        knowledge: knowledgeAlloc.selected,
        procedures: proceduresAlloc.selected,
        features: devAlloc.selected,
        manifest
    };
}

module.exports = { getRelevantContext };