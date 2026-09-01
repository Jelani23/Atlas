// backend/src/core/contextManager.js
const memoryCache = require('./memoryCache');
const hotSwapManager = require('./hotSwapManager');
const projectRegistry = require('../memory/projectRegistry');
const workingMemory = require('../memory/workingMemory');
const { extractKeywords } = require('../utils/keywordExtractor');

// --- 1. TOKEN ESTIMATOR ---
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// --- 2. INTENT-BASED CONTEXT PROFILES (OPTIMIZED) ---
//
// This table IS the "what context does this intent require?" layer that
// sits conceptually between intent resolution and memory retrieval:
//
//   INTENT  ->  CONTEXT_PROFILES[intent]  ->  per-category token budget
//               ->  allocateBudget() enforces it per category below
//
// A category budgeted at 0 for a given intent is a hard "this category is
// not required for this kind of request" - e.g. `search`/`action` pull no
// project memory, `capability` pulls no personal/project/knowledge/
// procedures at all because the world model (assembled separately in
// contextBuilder.js, not through this table) is the actual answer source
// for capability questions. This is a deterministic policy table on
// purpose, not an LLM decision (plan §19) - there is no separate
// "context requirements" subsystem to build; this table already is that
// subsystem, expressed as per-intent budgets instead of a prose spec.
// Extend it here (add a row, or widen an existing one) rather than
// building a parallel mechanism elsewhere.
const CONTEXT_PROFILES = {
    // Phase: `conversation` (what nearly every normal chat message
    // resolves to as intent.intent) had a knowledge budget of 0. That
    // meant knowledgeScored was computed, relevance-scored, and then
    // allocateBudget(knowledgeScored, 0) discarded all of it before it
    // ever reached the prompt - so Alice's actual stored knowledge
    // (including everything from search extraction) was invisible for
    // the overwhelming majority of turns, regardless of how relevant a
    // memory was to the current message. That's both why she couldn't
    // pull from it, and part of why she'd fall back to
    // possibly-wrong base-model knowledge instead of what she actually
    // has on file.
    // `reflections` follows the same "0 for intents that don't need it"
    // pattern as the other categories. It's deliberately modest even
    // where non-zero - a reflection is a session-scoped recap, useful as
    // light background for continuity ("what were we doing last time"),
    // not a primary information source the way project/knowledge memory
    // is. `memory` (explicit "what do you remember" questions) is the one
    // intent where it's weighted meaningfully higher.
    conversation: { personal: 220, project: 220, knowledge: 220, procedures: 100, devState: 0,   reflections: 240, conversationHistory: 260 },
    action:       { personal: 120, project: 0,   knowledge: 0,   procedures: 0,   devState: 0,   reflections: 0,   conversationHistory: 0 },
    coding:       { personal: 160, project: 420, knowledge: 180, procedures: 160, devState: 100, reflections: 140, conversationHistory: 320 },
    planning:     { personal: 180, project: 360, knowledge: 180, procedures: 160, devState: 160, reflections: 200, conversationHistory: 320 },
    search:       { personal: 80,  project: 0,   knowledge: 0,   procedures: 0,   devState: 0,   reflections: 0,   conversationHistory: 0 },
    memory:       { personal: 700, project: 360, knowledge: 360, procedures: 160, devState: 160, reflections: 480, conversationHistory: 500 },
    // Capability questions ("can you read your own code?") are answered
    // from the world model, assembled separately in contextBuilder.js -
    // none of these budgets are the relevant source, so all stay at 0.
    capability:   { personal: 0,   project: 0,    knowledge: 0,  procedures: 0,   devState: 0,   reflections: 0,   conversationHistory: 0 }
};

// --- 3. BUDGET ALLOCATOR ---
function allocateBudget(items, budget, maxItems = Infinity) {
    const selected = [];
    let used = 0;
    
    const sorted = items.sort((a, b) => b._finalScore - a._finalScore);
    
    for (const item of sorted) {
        if (selected.length >= maxItems) break;
        const topicsText = Array.isArray(item.topics) ? item.topics.join(' ') : '';
        const reflectionText = ['anchors', 'decisions', 'comparisons', 'open_loops']
            .flatMap(key => Array.isArray(item[key]) ? item[key] : [])
            .join(' ');
        const text = `${item.key || ''} ${item.value || ''} ${item.subject || ''} ${item.trigger || ''} ${item.action || ''} ${item.feature || ''} ${item.status || ''} ${item.summary || ''} ${item.content || ''} ${item.role || ''} ${item.session_id || ''} ${topicsText} ${reflectionText} ${item.category || ''} ${item.type || ''}`;
        const tokens = estimateTokens(text);
        
        if (used + tokens <= budget) {
            selected.push(item);
            used += tokens;
        }
    }
    
    return { selected, usedTokens: used };
}

// `workingMemory.getRelevant()` can return some of the same turns already
// present in the normal recent-history window. Remove those exact rows so
// Alice sees each turn once. Timestamp is part of the identity because the
// same role/content can legitimately occur more than once in a session.
function removeRecentConversationMessages(rows, history) {
    const recentKeys = new Set((history || []).map(message =>
        `${message.role || ''}\u0000${message.timestamp || ''}\u0000${message.content || ''}`
    ));

    return (rows || []).filter(message => !recentKeys.has(
        `${message.role || ''}\u0000${message.timestamp || ''}\u0000${message.content || ''}`
    ));
}

function scoreConversationMessage(message, keywords) {
    const topicsText = Array.isArray(message.topics) ? message.topics.join(' ') : '';
    const text = `${message.content || ''} ${topicsText}`.toLowerCase();
    let relevanceScore = 0;

    keywords.forEach(keyword => {
        if (text.includes(keyword)) relevanceScore += 25;
    });

    const importance = Number(message.importance) || 0;
    return {
        ...message,
        _relevanceScore: relevanceScore,
        _finalScore: relevanceScore + (importance * 10)
    };
}



function scoreAndBoost(store, item, keywords) {
    let relevanceScore = 0;
    const d = item.data;
    const topicsText = Array.isArray(d.topics) ? d.topics.join(' ') : '';
    // topics/category/type added so knowledge (and, incidentally,
    // procedure/project, which already had unused topics data) can
    // actually be matched by their retrieval metadata instead of
    // only their literal key/value text - see plan §13: knowledge
    // must be findable by category/subject/topics/key, not just
    // whatever words happen to appear in `value`. `summary` added for
    // reflections, which have no key/value - the summary text itself is
    // the only content there is to match against.
    const reflectionText = ['anchors', 'decisions', 'comparisons', 'open_loops']
        .flatMap(key => Array.isArray(d[key]) ? d[key] : [])
        .join(' ');
    const itemText = `${d.key || ''} ${d.value || ''} ${d.subject || ''} ${d.project_key || ''} ${d.trigger || ''} ${d.action || ''} ${d.feature || ''} ${d.status || ''} ${d.summary || ''} ${d.session_id || ''} ${topicsText} ${reflectionText} ${d.category || ''} ${d.type || ''}`.toLowerCase();
    
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

function isRecentSessionReference(text) {
    const input = String(text || '').toLowerCase();
    const recentFirst = /\b(previous|last|latest|most recent)(?:\s+\w+){0,3}\s+(conversation|session|chat)\b/;
    const sessionFirst = /\b(conversation|session|chat)(?:\s+\w+){0,3}\s+(previous|last|latest|most recent)\b/;
    return recentFirst.test(input) || sessionFirst.test(input);
}

function extractReferencedSessionIds(text) {
    const ids = [];
    const pattern = /\bsession\s+#?(\d+)\b/gi;
    for (const match of String(text || '').matchAll(pattern)) {
        ids.push(String(match[1]));
    }
    return Array.from(new Set(ids));
}

function scopeReflectionsToSessions(items, sessionIds) {
    if (!sessionIds || sessionIds.length === 0) return items || [];
    const allowed = new Set(sessionIds.map(String));
    return (items || []).filter(item =>
        allowed.has(String((item.data || item).session_id))
    );
}

function newestReflectionId(items) {
    let newest = null;
    for (const item of items || []) {
        const row = item.data || item;
        const timestamp = Date.parse(row.timestamp || '') || 0;
        const sessionId = Number(row.session_id) || 0;
        const rank = [timestamp, sessionId];
        if (!newest || rank[0] > newest.rank[0] || (rank[0] === newest.rank[0] && rank[1] > newest.rank[1])) {
            newest = { id: row.id ?? item.id, rank };
        }
    }
    return newest?.id ?? null;
}

const reflectionScopes = new Map();

function registerPreviousSession(sessionId, previousSessionId = null) {
    if (!sessionId) return;
    reflectionScopes.set(String(sessionId), {
        previousSessionId: previousSessionId == null ? null : String(previousSessionId),
        activeSessionId: null
    });

    if (reflectionScopes.size > 100) {
        reflectionScopes.delete(reflectionScopes.keys().next().value);
    }
}

function isReflectionFollowUp(text, history = []) {
    const input = String(text || '').toLowerCase().trim();
    if (!input.includes('?') && !/^(list|show|give)\b/.test(input)) return false;

    const hasBackReference = /\b(that|those|same|it|they|did we|do we|was left|were left)\b/.test(input);
    const hasReflectionField = /\b(label|theme|anchor|comparison|approach|decision|path|open loop|unresolved|left over|preferred)\b/.test(input);
    const recentContext = (history || []).slice(-4).map(message => String(message.content || '')).join(' ').toLowerCase();
    const followsRecallTurn = /\b(previous|last|latest|most recent|session\s+#?\d+|reflection)\b/.test(recentContext);

    return hasBackReference || (followsRecallTurn && hasReflectionField);
}

function isReflectionLookupRequest(text) {
    const input = String(text || '').toLowerCase();
    return /\b(previous|last|latest|most recent|earlier|past)\b/.test(input) ||
        /\bsession\s+#?\d+\b/.test(input) ||
        /\b(remember|recall|continue|resume|pick up|reflection for)\b/.test(input);
}

function resolveReflectionScope(userInput, history = [], sessionId = null) {
    const explicitSessionIds = extractReferencedSessionIds(userInput);
    const recentReference = explicitSessionIds.length === 0 && isRecentSessionReference(userInput);
    const state = sessionId ? reflectionScopes.get(String(sessionId)) : null;
    const followUp = explicitSessionIds.length === 0 && !recentReference && !!state?.activeSessionId &&
        isReflectionFollowUp(userInput, history);

    let sessionIds = explicitSessionIds;
    let reason = explicitSessionIds.length > 0 ? 'explicit' : null;

    if (recentReference && state?.previousSessionId) {
        sessionIds = [state.previousSessionId];
        reason = 'previous';
    } else if (recentReference) {
        reason = 'recent_fallback';
    } else if (followUp) {
        sessionIds = [state.activeSessionId];
        reason = 'follow_up';
    }

    if (state) {
        if (sessionIds.length > 0) {
            state.activeSessionId = sessionIds[0];
        } else if (!recentReference && !isReflectionLookupRequest(userInput)) {
            state.activeSessionId = null;
        }
    }

    return {
        sessionIds,
        reason,
        recentReference,
        enabled: sessionIds.length > 0 || recentReference || followUp || isReflectionLookupRequest(userInput)
    };
}

async function getRelevantContext(userInput, history, intent, options = {}) {
    console.time("[ContextManager] Total Processing");
    const reflectionScope = resolveReflectionScope(userInput, history, options.sessionId);
    const referencedSessionIds = reflectionScope.sessionIds;
    const recentHistoryStr = history.slice(-5).map(m => m.content).join(' ');
    const keywordSource = referencedSessionIds.length > 0
        ? userInput
        : `${userInput} ${recentHistoryStr}`;
    const keywords = extractKeywords(keywordSource);

    const [personalIdx, projectsIdx, knowledgeIdx, featuresIdx, proceduresIdx, reflectionsIdx] = await Promise.all([
        memoryCache.getMemory('user_profile'),
        memoryCache.getMemory('project_memory'),
        memoryCache.getMemory('knowledge_library'),
        memoryCache.getMemory('dev_state'),
        memoryCache.getMemory('procedural_memory'),
        memoryCache.getMemory('reflections')
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

    // Resolve the full project registry once. This replaces the old
    // findProjectByKey-only lookup and is also used below to detect
    // when the user names a registered project by name/alias even
    // when it isn't the active one - e.g. "what does Bindex use for
    // auth?" while Atlas is the active project should still be able
    // to answer about Bindex specifically, without pulling in every
    // OTHER project's memories too.
    const allProjects = await projectRegistry.getAllProjects();

    const projectNames = {};
    for (const p of allProjects) {
        if (p.project_key) {
            projectNames[p.project_key.toLowerCase()] = p.name || p.project_key;
        }
    }

    // Resolve the project key through the project registry.
    // This gives us the authoritative project record.
    const activeProject = currentProjectKey
        ? allProjects.find(p => p.project_key?.toLowerCase() === currentProjectKey) || null
        : null;

    // The project subject is kept temporarily for compatibility
    // with the existing project_memory table.
    const currentProjectKeyResolved =
        activeProject?.project_key?.toLowerCase() || null;

    // Detect any OTHER registered project explicitly named in this
    // message (by name or alias), so a project doesn't have to be
    // "active" for Alice to answer about it when directly asked -
    // e.g. "what do you know about SubSynq?" while Atlas is active.
    // This is name matching only (word-boundary, case-insensitive) -
    // it does NOT fall back to keyword/topic overlap, which is what
    // let memories from an unrelated project leak in before.
    const lowerUserInput = userInput.toLowerCase();
    const mentionedProjectKeys = new Set();

    for (const p of allProjects) {
        const candidateNames = [p.name, p.project_key, ...(p.aliases || [])]
            .filter(Boolean)
            .map(n => String(n).toLowerCase());

        const isMentioned = candidateNames.some(name => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerUserInput);
        });

        if (isMentioned && p.project_key) {
            mentionedProjectKeys.add(p.project_key.toLowerCase());
        }
    }

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

    const profileName = isAskingAboutSelf ? 'memory' : (intent && intent.intent ? intent.intent : 'conversation');
    const budgetProfile = CONTEXT_PROFILES[profileName] || CONTEXT_PROFILES.conversation;

    // Identity/relationship essentials personalize every turn, but the core
    // Alice/ATLAS identity already lives in the system prompt. Keep only a
    // small set here instead of duplicating the full profile on every request.
    const essentialsScored = essentials.map(item => scoreAndBoost('user_profile', item, keywords));
    const essentialsAlloc = allocateBudget(essentialsScored, Math.min(120, budgetProfile.personal), 4);

    // 3. Dynamic Personal: Only include if relevant OR if asking about self
    let dynamicPersonalScored = dynamicPersonal.map(item => scoreAndBoost('user_profile', item, keywords))
        .filter(m => m._relevanceScore > 0 || isAskingAboutSelf);
        
    // 4. Projects: scope STRICTLY to the active project and/or any
    // project explicitly named in this message. Relevance score is
    // still computed (used below for ordering/budget allocation
    // within that scoped set), but it must never be the reason a
    // DIFFERENT project's memory is included - that was the source
    // of cross-project leakage (a keyword shared with, say, Bindex's
    // memories would previously let Bindex facts appear while Atlas
    // was the active project).
    let projectScored = projectsIdx.map(item =>
        scoreAndBoost('project_memory', item, keywords)
    );

    const allowedProjectKeys = new Set(
        [currentProjectKeyResolved, ...mentionedProjectKeys].filter(Boolean)
    );

    let filteredProjects = projectScored.filter(m =>
        allowedProjectKeys.has(m.project_key?.toLowerCase()) && m._relevanceScore > 0
    );
        
    let knowledgeScored = knowledgeIdx.map(item => scoreAndBoost('knowledge_library', item, keywords))
        .filter(k => k._relevanceScore > 0 || knowledgeIdx.length <= 3);
        
    let proceduresScored = proceduresIdx.map(item => scoreAndBoost('procedural_memory', item, keywords))
        .filter(p => p._relevanceScore > 0 || proceduresIdx.length <= 5);

    const isDevRelevant = intent.action || intent.coding || intent.planning || isAskingAboutAtlas || isAskingAboutSelf || keywords.has('feature') || keywords.has('state');
    let devScored = isDevRelevant ? featuresIdx.map(item => scoreAndBoost('dev_state', item, keywords)).filter(f => f._relevanceScore > 0 || featuresIdx.length <= 5) : [];

    // Reflections: same fallback pattern as knowledge/procedures (include
    // everything when the table is small enough that "relevant" would
    // otherwise mean "empty"), but capped lower (<=3 vs <=5) since a
    // reflection is a whole-session recap - even the small-table fallback
    // shouldn't casually dump many of them into every turn.
    const exactSessionReference = referencedSessionIds.length > 0;
    const recentSessionReference = reflectionScope.recentReference;
    const strictReflectionScope = exactSessionReference || recentSessionReference;
    const latestReflectionId = recentSessionReference
        ? newestReflectionId(reflectionsIdx)
        : null;
    const reflectionCandidates = exactSessionReference
        ? scopeReflectionsToSessions(reflectionsIdx, referencedSessionIds)
        : reflectionsIdx;
    let reflectionsScored = reflectionCandidates
        .map(item => scoreAndBoost('reflections', item, keywords));

    if (exactSessionReference) {
        reflectionsScored = reflectionsScored.map(reflection => ({
            ...reflection,
            _finalScore: reflection._finalScore + 10_000
        }));
        console.log(
            `[ContextManager] Reflection scope: session ${referencedSessionIds.join(', ')} ` +
            `(${reflectionsScored.length} match${reflectionsScored.length === 1 ? '' : 'es'})`
        );
    } else if (reflectionScope.enabled) {
        reflectionsScored = reflectionsScored.filter(r =>
            r._relevanceScore > 0 ||
            reflectionsIdx.length <= 3 ||
            (recentSessionReference && r.id === latestReflectionId)
        );
    } else {
        reflectionsScored = [];
    }

    if (recentSessionReference) {
        reflectionsScored = reflectionsScored.map(reflection =>
            reflection.id === latestReflectionId
                ? { ...reflection, _finalScore: reflection._finalScore + 10_000 }
                : reflection
        );

        const latest = reflectionsScored.find(reflection => reflection.id === latestReflectionId);
        const state = options.sessionId ? reflectionScopes.get(String(options.sessionId)) : null;
        if (latest && state) state.activeSessionId = String(latest.session_id);
    }

    if (strictReflectionScope) {
        filteredProjects = [];
        knowledgeScored = [];
        proceduresScored = [];
        devScored = [];
    }

    // Reach beyond the last-N chat window only when this intent has a
    // conversation-history budget. This stays scoped to the live session:
    // reflections are the compact cross-session continuity layer, while raw
    // historical turns are deliberately not injected across sessions by
    // default. The DB query already requires topic overlap; this pass removes
    // duplicates from `history`, scores importance, and enforces a small
    // independent token budget before anything reaches the prompt.
    let conversationHistoryScored = [];
    const sessionId = options.sessionId || null;
    const conversationStore = options.workingMemory || workingMemory;
    if (budgetProfile.conversationHistory > 0 && sessionId && keywords.size > 0) {
        try {
            const candidates = await conversationStore.getRelevant(keywords, {
                sessionId,
                projectKey: currentProjectKeyResolved,
                crossSession: false,
                limit: 12
            });
            conversationHistoryScored = removeRecentConversationMessages(candidates, history)
                .map(message => scoreConversationMessage(message, keywords))
                .filter(message => message._relevanceScore > 0);
        } catch (error) {
            console.error('[ContextManager] Failed to retrieve earlier conversation context:', error.message);
        }
    }

    const remainingPersonalBudget = Math.max(0, budgetProfile.personal - essentialsAlloc.usedTokens);
    const dynamicPersonalAlloc = allocateBudget(dynamicPersonalScored, remainingPersonalBudget, 4);

    const personalAlloc = {
        selected: [...essentialsAlloc.selected, ...dynamicPersonalAlloc.selected],
        usedTokens: essentialsAlloc.usedTokens + dynamicPersonalAlloc.usedTokens
    };

    const projectAlloc = allocateBudget(filteredProjects, budgetProfile.project, profileName === 'memory' ? 8 : 4);
    const knowledgeAlloc = allocateBudget(knowledgeScored, budgetProfile.knowledge, profileName === 'memory' ? 8 : 4);
    const proceduresAlloc = allocateBudget(proceduresScored, budgetProfile.procedures, 3);
    const devAlloc = allocateBudget(devScored, budgetProfile.devState, 4);
    const reflectionLimit = exactSessionReference
        ? referencedSessionIds.length
        : (recentSessionReference ? 1 : (profileName === 'memory' ? 5 : 2));
    const reflectionsAlloc = allocateBudget(reflectionsScored, budgetProfile.reflections, reflectionLimit);
    const conversationHistoryAlloc = allocateBudget(conversationHistoryScored, budgetProfile.conversationHistory, 4);
    
    // Populate the hot memory cache with the memories that were
    // actually selected as relevant for the current request.
    memoryCache.setHotMemory('user_profile', personalAlloc.selected);
    memoryCache.setHotMemory('project_memory', projectAlloc.selected);
    memoryCache.setHotMemory('knowledge_library', knowledgeAlloc.selected);
    memoryCache.setHotMemory('procedural_memory', proceduresAlloc.selected);
    memoryCache.setHotMemory('dev_state', devAlloc.selected);
    memoryCache.setHotMemory('reflections', reflectionsAlloc.selected);
    memoryCache.setHotMemory('conversation_history', conversationHistoryAlloc.selected);

    console.log(
    `[ContextManager] 🔥 Hot Cache Updated | ` +
    `Personal: ${personalAlloc.selected.length} | ` +
    `Projects: ${projectAlloc.selected.length} | ` +
    `Knowledge: ${knowledgeAlloc.selected.length} | ` +
    `Procedures: ${proceduresAlloc.selected.length} | ` +
    `DevState: ${devAlloc.selected.length} | ` +
    `Reflections: ${reflectionsAlloc.selected.length} | ` +
    `Earlier turns: ${conversationHistoryAlloc.selected.length}`
);

    console.timeEnd("[ContextManager] Total Processing");

    const totalUsed = personalAlloc.usedTokens + projectAlloc.usedTokens + knowledgeAlloc.usedTokens + proceduresAlloc.usedTokens + devAlloc.usedTokens + reflectionsAlloc.usedTokens + conversationHistoryAlloc.usedTokens;
    const manifest = {
        task: profileName,
        allocations: {
            personal: personalAlloc.usedTokens,
            projects: projectAlloc.usedTokens,
            knowledge: knowledgeAlloc.usedTokens,
            procedures: proceduresAlloc.usedTokens,
            devState: devAlloc.usedTokens,
            reflections: reflectionsAlloc.usedTokens,
            conversationHistory: conversationHistoryAlloc.usedTokens
        },
        selected: {
            personal: personalAlloc.selected.length,
            projects: projectAlloc.selected.length,
            knowledge: knowledgeAlloc.selected.length,
            procedures: proceduresAlloc.selected.length,
            devState: devAlloc.selected.length,
            reflections: reflectionsAlloc.selected.length,
            conversationHistory: conversationHistoryAlloc.selected.length
        },
        totalUsed: totalUsed
    };
    
    console.log(`[ContextManager] 📊 Context Manifest (Task: ${manifest.task}) - Used ${totalUsed} tokens`);
    console.log(`   State: ${stateScored.length}t | Essentials: ${essentialsAlloc.selected.length}t | Dynamic: ${dynamicPersonalAlloc.selected.length}t | Projects: ${manifest.selected.projects} items | Proc: ${manifest.selected.procedures} items | Reflections: ${manifest.selected.reflections} items | Earlier turns: ${manifest.selected.conversationHistory} items`);

    return {
        hotState: memoryCache.getHotState(),
        state: stateScored,
        personal: personalAlloc.selected,
        projects: projectAlloc.selected,
        projectNames,
        activeProjectKey: currentProjectKeyResolved,
        knowledge: knowledgeAlloc.selected,
        procedures: proceduresAlloc.selected,
        features: devAlloc.selected,
        reflections: reflectionsAlloc.selected,
        conversationHistory: conversationHistoryAlloc.selected,
        manifest
    };
}

module.exports = {
    getRelevantContext,
    extractKeywords,
    removeRecentConversationMessages,
    scoreConversationMessage,
    isRecentSessionReference,
    newestReflectionId,
    extractReferencedSessionIds,
    scopeReflectionsToSessions,
    registerPreviousSession,
    isReflectionFollowUp,
    isReflectionLookupRequest,
    resolveReflectionScope
};
