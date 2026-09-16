// backend/src/core/contextManager.js
const memoryCache = require('./memoryCache');
const hotSwapManager = require('./hotSwapManager');
const projectRegistry = require('../memory/projectRegistry');
const workingMemory = require('../memory/workingMemory');
const sessionManager = require('../memory/sessionManager');
const { resolveProfileRecall, matchesProfileTopic, retrievalQuery } = require('../memory/profileRecall');
const { selectTopics } = require('./capabilityContext');
const {
    looksLikeTitleReference,
    resolveSessionTitleReference
} = require('../memory/sessionTitleResolver');
const { extractKeywords } = require('../utils/keywordExtractor');
const {
    classifyUserNote,
    isImplementationQuestion,
    isTrustedKnowledgeQuestion
} = require('../utils/turnGrounding');
const { isKnowledgeActive, isKnowledgeRetrievable } = require('../memory/knowledgeAudit');
const {
    getKnowledgeSearchTerms,
    getKnowledgeAnchorTerms,
    isKnowledgeRowRelevant
} = require('../memory/knowledgeRelevance');

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
    // The operating guide is assembled separately in contextBuilder.js.
    // Relevant dev_state records accompany it as dated feature tracking.
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

    const hasBackReference = /\b(that|those|same|it|they|did we|do we|did i|do i|i say|i mention|was left|were left|remained|remains|to be verified)\b/.test(input) ||
        /\bmy\s+(?:main\s+)?(?:concern|priority|constraint|preference|decision)s?\b/.test(input);
    const hasReflectionField = /\b(label|theme|anchor|comparison|approach|decision|path|open loop|unresolved|left over|preferred|priority|prioritize|concern|constraint|said|mention)\b/.test(input);
    const recentContext = (history || []).slice(-4).map(message => String(message.content || '')).join(' ').toLowerCase();
    const followsRecallTurn = /\b(previous|last|latest|most recent|session\s+#?\d+|reflection)\b/.test(recentContext);

    return hasBackReference || (followsRecallTurn && hasReflectionField);
}

function isReflectionLookupRequest(text) {
    const input = String(text || '').toLowerCase().trim();
    const continuation = /^(?:let['’]?s\s+)?(?:continue|resume|pick up)\b/.test(input);
    if (continuation) return true;

    const question = input.includes('?') ||
        /^(?:what|which|who|when|where|why|how|do|did|does|can|could|would|was|were|is|are|tell|remind|recall|remember)\b/.test(input);
    if (!question) return false;

    return /\b(?:remember|recall|previously|earlier|last time|reflection for)\b/.test(input) ||
        /\bwhat did (?:we|i)\b/.test(input) ||
        /\bwhat (?:was|were) my\b/.test(input);
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

function applyTitleReflectionScope(scope, titleResolution, sessionId = null) {
    if (!titleResolution?.attempted) return scope;

    const state = sessionId ? reflectionScopes.get(String(sessionId)) : null;
    if (titleResolution.match) {
        if (state) state.activeSessionId = titleResolution.match.sessionId;
        return {
            ...scope,
            sessionIds: [titleResolution.match.sessionId],
            reason: 'title',
            recentReference: false,
            enabled: true,
            title: titleResolution.match.title,
            titleLookupAttempted: true,
            ambiguousTitles: []
        };
    }

    if (state) state.activeSessionId = null;
    return {
        ...scope,
        sessionIds: [],
        reason: titleResolution.ambiguous?.length ? 'title_ambiguous' : 'title_missing',
        recentReference: false,
        enabled: true,
        title: titleResolution.hint || null,
        titleLookupAttempted: true,
        ambiguousTitles: titleResolution.ambiguous || []
    };
}

async function getRelevantContext(userInput, history, intent, options = {}) {
    console.time("[ContextManager] Total Processing");
    let reflectionScope = resolveReflectionScope(userInput, history, options.sessionId);
    const shouldResolveTitle = reflectionScope.reason !== 'explicit' &&
        !reflectionScope.recentReference &&
        looksLikeTitleReference(userInput);
    const sessionStore = options.sessionStore || sessionManager;
    const profileRecall = resolveProfileRecall(userInput, history);
    const capabilityTopics = selectTopics(userInput, history, intent);
    const capabilityQuestion = capabilityTopics.length > 0 && /\b(?:atlas|your|you|dev_state|dev state|features?|capabilities)\b/i.test(userInput);
    const allProjects = await projectRegistry.getAllProjects();
    const names = allProjects.flatMap(p => [p.name, p.project_key, ...(p.aliases || [])]).filter(Boolean);
    const namesProject = names.some(name => new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(userInput));
    const profileOnly = Boolean(profileRecall) && !capabilityQuestion && !namesProject
        && !reflectionScope.reason && !shouldResolveTitle && !/\b(?:search|procedure|workflow|knowledge|project)\b/i.test(userInput);
    const readBank = bank => profileOnly ? Promise.resolve([]) : memoryCache.getMemory(bank);

    let profileReadFailed = false;
    const [personalIdx, projectsIdx, knowledgeIdx, featuresIdx, proceduresIdx, reflectionsIdx, titledSessions] = await Promise.all([
        memoryCache.getMemory('user_profile').catch(error => {
            profileReadFailed = true;
            console.error('[ContextManager] User profile unavailable:', error.message);
            return [];
        }),
        readBank('project_memory'),
        readBank('knowledge_library'),
        readBank('dev_state'),
        readBank('procedural_memory'),
        readBank('reflections'),
        shouldResolveTitle ? sessionStore.listTitledSessions() : Promise.resolve([])
    ]);

    if (shouldResolveTitle) {
        const reflectedSessionIds = new Set(
            reflectionsIdx.map(item => String((item.data || item).session_id))
        );
        reflectionScope = applyTitleReflectionScope(
            reflectionScope,
            resolveSessionTitleReference(
                userInput,
                titledSessions.map(session => ({
                    ...session,
                    hasReflection: reflectedSessionIds.has(String(session.id))
                }))
            ),
            options.sessionId
        );
    }

    const referencedSessionIds = reflectionScope.sessionIds;
    const keywordSource = referencedSessionIds.length > 0
        ? userInput
        : retrievalQuery(userInput, history);
    const keywords = extractKeywords(keywordSource);

    const lowerInput = userInput.toLowerCase();
    const userNoteType = classifyUserNote(userInput);
    const implementationQuestion = isImplementationQuestion(userInput);
    const trustedKnowledgeQuestion = isTrustedKnowledgeQuestion(userInput);
    const isAskingAboutSelf = Boolean(profileRecall);
    const profileKeywords = profileRecall ? extractKeywords(profileRecall.query) : keywords;
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
    const budgetProfile = { ...(CONTEXT_PROFILES[profileName] || CONTEXT_PROFILES.conversation) };
    if (capabilityQuestion) budgetProfile.devState = Math.max(budgetProfile.devState, 160);
    // Explicit recall needs more than the small personalization slice. Keep a
    // bounded budget, but do not silently cap a whole profile at eight rows.
    if (profileRecall) budgetProfile.personal = 1600;
    if (profileOnly) {
        for (const bank of ['project', 'knowledge', 'procedures', 'devState', 'reflections', 'conversationHistory']) budgetProfile[bank] = 0;
    }

    // Identity/relationship essentials personalize every turn, but the core
    // Alice/ATLAS identity already lives in the system prompt. Keep only a
    // small set here instead of duplicating the full profile on every request.
    const scoreProfile = item => {
        const scored = scoreAndBoost('user_profile', item, profileKeywords);
        if (profileRecall) {
            // Current recall terms outrank activation from old dialogue.
            const favorite = /favou?rite/i.test(`${scored.key} ${scored.value}`);
            scored._finalScore = scored._relevanceScore + (profileRecall.favorites && favorite ? 1000 : 0);
        }
        return scored;
    };
    const essentialsScored = essentials.filter(item => matchesProfileTopic(item.data, profileRecall)).map(scoreProfile);
    const essentialsAlloc = allocateBudget(essentialsScored, Math.min(120, budgetProfile.personal), 4);

    // 3. Dynamic Personal: Only include if relevant OR if asking about self
    let dynamicPersonalScored = dynamicPersonal.filter(item => matchesProfileTopic(item.data, profileRecall)).map(scoreProfile)
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
        
    const knowledgeTerms = getKnowledgeSearchTerms(userInput);
    const knowledgeAnchors = getKnowledgeAnchorTerms(knowledgeTerms);
    const activeKnowledgeIdx = knowledgeIdx.filter(item => isKnowledgeActive(item.data));
    const relevantKnowledgeIdx = activeKnowledgeIdx.filter(item =>
        isKnowledgeRowRelevant(item.data, knowledgeTerms, knowledgeAnchors)
    );
    const trustedKnowledgeIdx = relevantKnowledgeIdx.filter(item => isKnowledgeRetrievable(item.data));
    const quarantinedKnowledgeIdx = relevantKnowledgeIdx.filter(item => !isKnowledgeRetrievable(item.data));
    const quarantinedKnowledgeCount = activeKnowledgeIdx.filter(item =>
        !isKnowledgeRetrievable(item.data)
    ).length;
    if (quarantinedKnowledgeCount > 0) {
        console.log(`[ContextManager] Knowledge quarantine: suppressed ${quarantinedKnowledgeCount} unverified record${quarantinedKnowledgeCount === 1 ? '' : 's'}.`);
    }

    let knowledgeScored = trustedKnowledgeIdx
        .map(item => scoreAndBoost('knowledge_library', item, keywords))
        .filter(k => k._relevanceScore > 0 || trustedKnowledgeIdx.length <= 3);
    const quarantinedKnowledgeScored = trustedKnowledgeQuestion
        ? quarantinedKnowledgeIdx
            .map(item => scoreAndBoost('knowledge_library', item, keywords))
            .filter(item => item._relevanceScore > 0)
        : [];
        
    let proceduresScored = proceduresIdx.map(item => scoreAndBoost('procedural_memory', item, keywords))
        .filter(p => p._relevanceScore > 0);

    const isDevRelevant = capabilityQuestion || intent.action || intent.coding || intent.planning || isAskingAboutAtlas || keywords.has('feature') || keywords.has('state');
    let devScored = isDevRelevant ? featuresIdx.map(item => scoreAndBoost('dev_state', item, keywords)).filter(f => f._relevanceScore > 0) : [];

    // Reflections require relevance or an explicit session selection.
    // A small table is not evidence that its contents concern this request.
    const exactSessionReference = referencedSessionIds.length > 0;
    const recentSessionReference = reflectionScope.recentReference;
    const strictReflectionScope = exactSessionReference || recentSessionReference || reflectionScope.titleLookupAttempted;
    const unresolvedTitleReference = reflectionScope.titleLookupAttempted && !exactSessionReference;
    const latestReflectionId = recentSessionReference && !exactSessionReference
        ? newestReflectionId(reflectionsIdx)
        : null;
    const reflectionCandidates = unresolvedTitleReference
        ? []
        : exactSessionReference
        ? scopeReflectionsToSessions(reflectionsIdx, referencedSessionIds)
        : reflectionsIdx;
    let reflectionsScored = reflectionCandidates
        .map(item => scoreAndBoost('reflections', item, keywords));

    if (exactSessionReference) {
        reflectionsScored = reflectionsScored.map(reflection => ({
            ...reflection,
            session_title: reflectionScope.reason === 'title' ? reflectionScope.title : reflection.session_title,
            _finalScore: reflection._finalScore + 10_000
        }));
        const titleLabel = reflectionScope.reason === 'title'
            ? `title "${reflectionScope.title}" -> session ${referencedSessionIds.join(', ')}`
            : `session ${referencedSessionIds.join(', ')}`;
        console.log(
            `[ContextManager] Reflection scope: ${titleLabel} ` +
            `(${reflectionsScored.length} match${reflectionsScored.length === 1 ? '' : 'es'})`
        );
    } else if (reflectionScope.reason === 'title_ambiguous') {
        console.log(
            `[ContextManager] Reflection scope: title is ambiguous (${reflectionScope.ambiguousTitles.join(', ')})`
        );
    } else if (reflectionScope.reason === 'title_missing') {
        console.log(`[ContextManager] Reflection scope: no titled session matched "${reflectionScope.title || ''}"`);
    } else if (reflectionScope.enabled) {
        reflectionsScored = reflectionsScored.filter(r =>
            r._relevanceScore > 0 ||
            (recentSessionReference && r.id === latestReflectionId)
        );
    } else {
        reflectionsScored = [];
    }

    if (recentSessionReference && !exactSessionReference) {
        reflectionsScored = reflectionsScored.map(reflection =>
            reflection.id === latestReflectionId
                ? { ...reflection, _finalScore: reflection._finalScore + 10_000 }
                : reflection
        );

        const latest = reflectionsScored.find(reflection => reflection.id === latestReflectionId);
        const state = options.sessionId ? reflectionScopes.get(String(options.sessionId)) : null;
        if (latest && state) {
            state.activeSessionId = String(latest.session_id);
            console.log(`[ContextManager] Reflection scope: recent session ${latest.session_id} (1 match)`);
        }
    }

    if (strictReflectionScope) {
        filteredProjects = [];
        knowledgeScored = [];
        proceduresScored = [];
        devScored = [];
    }

    // A new design note is the evidence for this turn. Old memories can
    // provide continuity later, but should not turn the note into a claim
    // that the feature already exists.
    if (userNoteType) {
        dynamicPersonalScored = [];
        filteredProjects = [];
        knowledgeScored = [];
        proceduresScored = [];
        devScored = [];
        reflectionsScored = [];
        console.log(`[ContextManager] Grounding scope: user ${userNoteType} (retrieved claims suppressed)`);
    }

    if (implementationQuestion) {
        dynamicPersonalScored = [];
        filteredProjects = [];
        knowledgeScored = [];
        proceduresScored = [];
        reflectionsScored = [];
        console.log('[ContextManager] Grounding scope: implementation question (memory claims suppressed)');
    }

    // Reach beyond the last-N chat window only when this intent has a
    // conversation-history budget. This stays scoped to the live session:
    // reflections are the compact cross-session continuity layer, while raw
    // historical turns are deliberately not injected across sessions by
    // default. The DB query already requires topic overlap; this pass removes
    // duplicates from `history`, scores importance, and enforces a small
    // independent token budget before anything reaches the prompt.
    let conversationHistoryScored = [];
    let conversationHistoryStatus = 'not_requested';
    const sessionId = options.sessionId || null;
    const conversationStore = options.workingMemory || workingMemory;
    if (!userNoteType && !implementationQuestion && budgetProfile.conversationHistory > 0 && sessionId && keywords.size > 0) {
        try {
            const candidates = await conversationStore.getRelevant(keywords, {
                sessionId,
                projectKey: currentProjectKeyResolved,
                crossSession: false,
                limit: 12
            });
            conversationHistoryStatus = 'loaded';
            conversationHistoryScored = removeRecentConversationMessages(candidates, history)
                .map(message => scoreConversationMessage(message, keywords))
                .filter(message => message._relevanceScore > 0);
        } catch (error) {
            conversationHistoryStatus = 'unavailable';
            console.error('[ContextManager] Failed to retrieve earlier conversation context:', error.message);
        }
    }

    const remainingPersonalBudget = Math.max(0, budgetProfile.personal - essentialsAlloc.usedTokens);
    const dynamicPersonalAlloc = allocateBudget(dynamicPersonalScored, remainingPersonalBudget, 4);

    const personalAlloc = profileRecall ? allocateBudget(
        [...essentialsScored, ...dynamicPersonalScored], budgetProfile.personal
    ) : {
        selected: [...essentialsAlloc.selected, ...dynamicPersonalAlloc.selected],
        usedTokens: essentialsAlloc.usedTokens + dynamicPersonalAlloc.usedTokens
    };

    const projectAlloc = allocateBudget(filteredProjects, budgetProfile.project, profileName === 'memory' ? 8 : 4);
    const knowledgeAlloc = allocateBudget(knowledgeScored, budgetProfile.knowledge, profileName === 'memory' ? 8 : 4);
    const quarantinedKnowledgeAlloc = allocateBudget(quarantinedKnowledgeScored, 1200, 10);
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
    const selectedEssentials = personalAlloc.selected.filter(item => essentialsClasses.includes(item.category)).length;
    console.log(`   State: ${stateScored.length} items | Essentials: ${selectedEssentials} items | Dynamic: ${personalAlloc.selected.length - selectedEssentials} items | Projects: ${manifest.selected.projects} items | Proc: ${manifest.selected.procedures} items | Reflections: ${manifest.selected.reflections} items | Earlier turns: ${manifest.selected.conversationHistory} items`);

    const profileCoverage = profileRecall ? {
        status: profileReadFailed ? 'unavailable' : 'loaded',
        scope: profileRecall.topics.length ? 'topic' : 'full_profile',
        topics: profileRecall.topics,
        available: essentialsScored.length + dynamicPersonalScored.length,
        excludedAsUnrelated: essentials.length + dynamicPersonal.length - essentialsScored.length - dynamicPersonalScored.length,
        selected: personalAlloc.selected.length,
        omitted: essentialsScored.length + dynamicPersonalScored.length - personalAlloc.selected.length
    } : null;
    if (profileCoverage) console.log('[ContextManager] Profile recall:', JSON.stringify(profileCoverage));

    return {
        hotState: profileOnly ? { activeProject: null, activeFiles: [], currentTask: null } : memoryCache.getHotState(),
        state: profileOnly ? [] : stateScored,
        personal: personalAlloc.selected,
        profileCoverage,
        projects: projectAlloc.selected,
        projectNames,
        activeProjectKey: currentProjectKeyResolved,
        knowledge: knowledgeAlloc.selected,
        quarantinedKnowledge: quarantinedKnowledgeAlloc.selected,
        procedures: proceduresAlloc.selected,
        features: devAlloc.selected,
        reflections: reflectionsAlloc.selected,
        conversationHistory: conversationHistoryAlloc.selected,
        conversationHistoryStatus,
        reflectionScope: {
            reason: reflectionScope.reason,
            sessionIds: [...reflectionScope.sessionIds],
            strict: strictReflectionScope,
            title: reflectionScope.title || null,
            ambiguousTitles: reflectionScope.ambiguousTitles || []
        },
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
    resolveReflectionScope,
    applyTitleReflectionScope
};
