const assert = require('assert');

// contextManager imports the real Supabase-backed stores at module load.
// These syntactically valid placeholders let this pure helper test load the
// module without contacting a database.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
    removeRecentConversationMessages,
    scoreConversationMessage,
    isRecentSessionReference,
    newestReflectionId,
    extractReferencedSessionIds,
    scopeReflectionsToSessions,
    registerPreviousSession,
    resolveReflectionScope,
    isReflectionLookupRequest,
    getRelevantContext
} = require('../src/core/contextManager');
const { extractKeywords } = require('../src/utils/keywordExtractor');
const { compactSearchEvidence } = require('../src/core/contextBuilder');
const {
    classifyUserNote,
    isImplementationQuestion,
    hasImplementationEvidence,
    resolveUserNoteReply,
    resolveImplementationBoundaryReply,
    isTrustedKnowledgeQuestion,
    resolveTrustedKnowledgeBoundaryReply
} = require('../src/utils/turnGrounding');

function testUserNoteClassification() {
    assert.strictEqual(
        classifyUserNote('We decided that knowledge entries should preserve their source.'),
        'decision'
    );
    assert.strictEqual(
        classifyUserNote('Unverified search results should not be treated as established facts.'),
        'policy'
    );
    assert.strictEqual(
        classifyUserNote('We still need to determine how stale knowledge should expire.'),
        'open_loop'
    );
    assert.strictEqual(classifyUserNote('Should we expire stale knowledge?'), null);
    assert.strictEqual(classifyUserNote('I want to know what model handles chat.'), null);
    assert.strictEqual(
        resolveUserNoteReply('Knowledge without provenance should remain quarantined.'),
        "Understood. I'll treat that as a policy requirement, not as something already implemented."
    );
    assert.strictEqual(
        isImplementationQuestion('Does the current database already store verification status?'),
        true
    );
    assert.strictEqual(isImplementationQuestion('What model handles general conversation?'), false);
    assert(resolveImplementationBoundaryReply('Does the current database already store verification status?'));
    assert.strictEqual(
        resolveImplementationBoundaryReply(
            'Does the current database already store verification status?',
            { toolName: 'read_code', toolResult: 'knowledge_library columns: id, source, source_type' }
        ),
        null
    );
    assert.strictEqual(
        hasImplementationEvidence({ toolName: 'append_note', toolResult: 'Successfully updated the note.' }),
        false
    );
    assert.strictEqual(
        isTrustedKnowledgeQuestion('Without searching the web, what does your trusted knowledge say is current?'),
        true
    );
    assert.strictEqual(
        resolveTrustedKnowledgeBoundaryReply(
            'Without searching the web, what does your trusted knowledge say is current?',
            { knowledge: [] }
        ),
        "I don't have verified stored knowledge for that request. Since you asked me not to search the web, I can't verify a current answer."
    );
    const provisionalReply = resolveTrustedKnowledgeBoundaryReply(
        'Without searching the web, what does your trusted knowledge say is the latest stable Ollama release?',
        {
            knowledge: [],
            quarantinedKnowledge: [
                { id: 10, subject: 'ollama_release', key: 'latest_stable_version', value: 'v0.1.35', source: 'web_search: latest Ollama release' },
                { id: 11, subject: 'ollama_version', key: 'latest_stable_version', value: 'v0.33.2', source: 'web_search: latest Ollama release' }
            ]
        }
    );
    assert(provisionalReply.includes('matching provisional knowledge records'));
    assert(provisionalReply.includes('[record 10] "v0.1.35"'));
    assert(provisionalReply.includes('[record 11] "v0.33.2"'));
    assert(provisionalReply.includes("can't present it as verified or current"));
    assert.strictEqual(
        resolveTrustedKnowledgeBoundaryReply(
            'What does your trusted knowledge say about JavaScript?',
            { knowledge: [{ subject: 'javascript' }] }
        ),
        "I don't have verified stored knowledge for that request."
    );
}

function testRecentTurnsAreRemovedByExactRowIdentity() {
    const history = [
        {
            role: 'user',
            content: 'Let us fix reflection retrieval.',
            timestamp: '2026-08-31T12:00:00.000Z'
        }
    ];

    const rows = [
        {
            id: 1,
            role: 'user',
            content: 'Let us fix reflection retrieval.',
            timestamp: '2026-08-31T12:00:00.000Z'
        },
        {
            id: 2,
            role: 'user',
            content: 'Let us fix reflection retrieval.',
            timestamp: '2026-08-30T12:00:00.000Z'
        },
        {
            id: 3,
            role: 'assistant',
            content: 'The reflection cache is wired now.',
            timestamp: '2026-08-30T12:01:00.000Z'
        }
    ];

    const filtered = removeRecentConversationMessages(rows, history);
    assert.deepStrictEqual(filtered.map(row => row.id), [2, 3]);
}

function testConversationScoringUsesTopicsAndImportance() {
    const keywords = extractKeywords('continue reflection retrieval work');
    const lowImportance = scoreConversationMessage({
        id: 1,
        content: 'We discussed the session journal.',
        topics: ['reflection', 'retrieval'],
        importance: 0
    }, keywords);
    const highImportance = scoreConversationMessage({
        id: 2,
        content: 'We discussed the session journal.',
        topics: ['reflection', 'retrieval'],
        importance: 2
    }, keywords);

    assert(lowImportance._relevanceScore > 0);
    assert.strictEqual(
        highImportance._finalScore - lowImportance._finalScore,
        20
    );
}

function testInvalidationClearsBothCacheLayers() {
    const memoryCache = require('../src/core/memoryCache');
    memoryCache.setHotMemory('reflections', [{ id: 1, summary: 'stale' }]);
    assert.strictEqual(memoryCache.getHotMemory('reflections').length, 1);

    memoryCache.invalidate('reflections');
    assert.deepStrictEqual(memoryCache.getHotMemory('reflections'), []);
    assert.strictEqual(memoryCache.getHotState().lastUpdated, null);
}

function testRecentSessionReferenceUsesNewestReflection() {
    assert.strictEqual(
        isRecentSessionReference('What was the label in the previous completed conversation?'),
        true
    );
    assert.strictEqual(
        isRecentSessionReference('Explain reflection retrieval in general.'),
        false
    );

    const newestId = newestReflectionId([
        { id: 1, data: { id: 1, session_id: 114, timestamp: '2026-08-07T19:17:21.228Z' } },
        { id: 2, data: { id: 2, session_id: 1176, timestamp: '2026-09-01T16:15:50.112Z' } }
    ]);
    assert.strictEqual(newestId, 2);
}

function testExactSessionReferenceHasOneScope() {
    const ids = extractReferencedSessionIds(
        'What exact reflection test label was recorded in session 1176?'
    );
    assert.deepStrictEqual(ids, ['1176']);

    const scoped = scopeReflectionsToSessions([
        { id: 68, data: { session_id: 1176, summary: 'Willow session' } },
        { id: 69, data: { session_id: 1181, summary: 'Later test answers' } }
    ], ids);
    assert.deepStrictEqual(scoped.map(item => item.data.session_id), [1176]);
}

function testPreviousConversationUsesTheActualOutgoingSession() {
    registerPreviousSession(1188, 1187);
    const scope = resolveReflectionScope(
        'What was the reflection test label in the previous completed conversation?',
        [],
        1188
    );

    assert.deepStrictEqual(scope.sessionIds, ['1187']);
    assert.strictEqual(scope.reason, 'previous');
}

function testReflectionScopeCarriesAcrossFollowUps() {
    registerPreviousSession(1188, 1187);
    resolveReflectionScope(
        'What was the reflection test label in the previous completed conversation?',
        [],
        1188
    );

    const history = [
        { role: 'user', content: 'What was the label in the previous completed conversation?' },
        { role: 'assistant', content: 'The label was Juniper.' }
    ];
    const comparison = resolveReflectionScope('What two approaches did we compare?', history, 1188);
    const laterHistory = [
        { role: 'user', content: 'What two approaches did we compare?' },
        { role: 'assistant', content: 'Automatic processing and manual regeneration.' },
        { role: 'user', content: 'Which approach did we prefer?' },
        { role: 'assistant', content: 'Automatic processing.' }
    ];
    const unresolved = resolveReflectionScope('What work was left unresolved?', laterHistory, 1188);

    assert.deepStrictEqual(comparison.sessionIds, ['1187']);
    assert.strictEqual(comparison.reason, 'follow_up');
    assert.deepStrictEqual(unresolved.sessionIds, ['1187']);
}

function testUserAttributedQuestionsKeepReflectionScope() {
    registerPreviousSession(1212, 1211);
    resolveReflectionScope(
        'What were my main concerns in session 1211?',
        [],
        1212
    );

    const history = [
        { role: 'user', content: 'What were my main concerns in our Knowledge Library Planning chat?' },
        { role: 'assistant', content: 'You wanted to clean the knowledge library first.' }
    ];
    const priority = resolveReflectionScope('What did I want to prioritize first, and why?', history, 1212);
    const constraint = resolveReflectionScope(
        'What did I explicitly say not to do yet?',
        [...history, { role: 'user', content: 'What did I want to prioritize first, and why?' }],
        1212
    );

    assert.deepStrictEqual(priority.sessionIds, ['1211']);
    assert.strictEqual(priority.reason, 'follow_up');
    assert.deepStrictEqual(constraint.sessionIds, ['1211']);
}

function testOrdinaryStatementsDoNotActivateOldReflections() {
    assert.strictEqual(
        isReflectionLookupRequest('This conversation\'s reflection test label is Juniper.'),
        false
    );
    assert.strictEqual(
        isReflectionLookupRequest('Let\'s continue the reflection retrieval work.'),
        true
    );
    assert.strictEqual(
        isReflectionLookupRequest('We still need to verify recall after the backend loses its in-memory scope.'),
        false
    );
}

async function testRestartFallbackBecomesTheFollowUpScope() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => {
        if (store === 'reflections') {
            return [
                { id: 10, score: 0, data: { id: 10, session_id: 1196, timestamp: '2026-09-01T18:00:00Z', summary: 'Sequoia', anchors: ['test_label: Sequoia'], topics: ['recovery'] } },
                { id: 9, score: 0, data: { id: 9, session_id: 1194, timestamp: '2026-09-01T17:00:00Z', summary: 'Magnolia', anchors: ['test_label: Magnolia'], topics: ['reflection'] } }
            ];
        }
        return [];
    };
    projectRegistry.getAllProjects = async () => [];
    registerPreviousSession(1198);

    try {
        const first = await getRelevantContext(
            'What was the reflection test label in the most recent meaningful completed conversation?',
            [],
            { intent: 'conversation' },
            { sessionId: 1198, workingMemory: { getRelevant: async () => [] } }
        );
        const followUp = resolveReflectionScope(
            'What two recovery approaches did we compare?',
            [
                { role: 'user', content: 'What was the label in the most recent completed conversation?' },
                { role: 'assistant', content: 'Sequoia' }
            ],
            1198
        );
        const laterFollowUp = resolveReflectionScope(
            'What remained to be verified?',
            [
                { role: 'user', content: 'What two recovery approaches did we compare?' },
                { role: 'assistant', content: 'Database-backed and in-memory recovery.' },
                { role: 'user', content: 'Which recovery path did we select?' },
                { role: 'assistant', content: 'Database-backed recovery.' }
            ],
            1198
        );

        assert.deepStrictEqual(first.reflections.map(row => row.session_id), [1196]);
        assert.deepStrictEqual(followUp.sessionIds, ['1196']);
        assert.deepStrictEqual(laterFollowUp.sessionIds, ['1196']);
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
    }
}

async function testScopedReflectionLookupExcludesCompetingMemoryStores() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => {
        if (store === 'reflections') {
            return [
                { id: 1, score: 0, data: { id: 1, session_id: 1187, summary: 'Juniper', anchors: ['test_label: Juniper'], topics: ['reflection'] } },
                { id: 2, score: 0, data: { id: 2, session_id: 1176, summary: 'Willow', anchors: ['test_label: Willow'], topics: ['reflection'] } }
            ];
        }
        if (store === 'project_memory') {
            return [{ id: 3, score: 0, data: { project_key: 'atlas', key: 'old_label', value: 'Willow' } }];
        }
        if (store === 'knowledge_library') {
            return [{ id: 4, score: 0, data: { key: 'old_test', value: 'conversation closure' } }];
        }
        if (store === 'procedural_memory') {
            return [{ id: 5, score: 0, data: { key: 'old_rule', value: 'Use the old session' } }];
        }
        return [];
    };
    projectRegistry.getAllProjects = async () => [{ project_key: 'atlas', name: 'Atlas', aliases: [] }];
    memoryCache.setHotState('activeProject', 'atlas');
    registerPreviousSession(1188, 1187);

    try {
        const result = await getRelevantContext(
            'What was the reflection test label in the previous completed conversation?',
            [],
            { intent: 'conversation' },
            { sessionId: 1188, workingMemory: { getRelevant: async () => [] } }
        );

        assert.deepStrictEqual(result.reflections.map(row => row.session_id), [1187]);
        assert.deepStrictEqual(result.projects, []);
        assert.deepStrictEqual(result.knowledge, []);
        assert.deepStrictEqual(result.procedures, []);
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
        memoryCache.setHotState('activeProject', null);
    }
}

async function testConversationTitleSelectsAndCarriesOneReflection() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => {
        if (store === 'reflections') {
            return [
                {
                    id: 1,
                    score: 0,
                    data: {
                        id: 1,
                        session_id: 1194,
                        summary: 'Magnolia tested reflection timing.',
                        anchors: ['test_label: Magnolia'],
                        comparisons: ['immediate vs delayed processing']
                    }
                },
                {
                    id: 2,
                    score: 0,
                    data: {
                        id: 2,
                        session_id: 1201,
                        summary: 'Redwood tested durable retrieval.',
                        anchors: ['test_label: Redwood']
                    }
                }
            ];
        }
        if (store === 'project_memory') {
            return [{ id: 3, score: 0, data: { project_key: 'atlas', key: 'noise', value: 'Magnolia' } }];
        }
        return [];
    };
    projectRegistry.getAllProjects = async () => [{ project_key: 'atlas', name: 'Atlas', aliases: [] }];
    memoryCache.setHotState('activeProject', 'atlas');
    registerPreviousSession(1210, 1201);

    const sessionStore = {
        listTitledSessions: async () => [
            { id: 1194, title: 'Magnolia Reflection Timing', ended_at: '2026-09-01T17:00:00Z' },
            { id: 1201, title: 'Redwood Retrieval', ended_at: '2026-09-01T18:00:00Z' }
        ]
    };

    try {
        const result = await getRelevantContext(
            'In our chat about Magnolia Reflection Timing, what did we discuss?',
            [],
            { intent: 'conversation' },
            {
                sessionId: 1210,
                sessionStore,
                workingMemory: { getRelevant: async () => [] }
            }
        );
        const followUp = resolveReflectionScope(
            'Which approach did we select?',
            [
                { role: 'user', content: 'In our chat about Magnolia Reflection Timing, what did we discuss?' },
                { role: 'assistant', content: 'Magnolia tested reflection timing.' }
            ],
            1210
        );

        assert.deepStrictEqual(result.reflections.map(row => row.session_id), [1194]);
        assert.strictEqual(result.reflectionScope.reason, 'title');
        assert.strictEqual(result.reflectionScope.title, 'Magnolia Reflection Timing');
        assert.deepStrictEqual(result.projects, []);
        assert.deepStrictEqual(followUp.sessionIds, ['1194']);
        assert.strictEqual(followUp.reason, 'follow_up');
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
        memoryCache.setHotState('activeProject', null);
    }
}

async function testMissingConversationTitleDoesNotUseAnotherReflection() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => store === 'reflections'
        ? [{
            id: 1,
            score: 0,
            data: {
                id: 1,
                session_id: 1194,
                summary: 'An unrelated Magnolia reflection.',
                anchors: ['test_label: Magnolia']
            }
        }]
        : [];
    projectRegistry.getAllProjects = async () => [];
    registerPreviousSession(1212, 1194);

    try {
        const result = await getRelevantContext(
            'In our chat about Missing Conversation, what did we discuss?',
            [],
            { intent: 'conversation' },
            {
                sessionId: 1212,
                sessionStore: { listTitledSessions: async () => [] },
                workingMemory: { getRelevant: async () => [] }
            }
        );

        assert.deepStrictEqual(result.reflections, []);
        assert.strictEqual(result.reflectionScope.reason, 'title_missing');
        assert.strictEqual(result.reflectionScope.strict, true);
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
    }
}

function testSearchCompactionPreservesEverySource() {
    const raw = [
        'SEARCH_STATUS: RESULTS_FOUND\n',
        `--- Source material 1 ---\nSOURCE_ONE ${'a'.repeat(8000)}\n`,
        `--- Source material 2 ---\nSOURCE_TWO ${'b'.repeat(8000)}\n`,
        `--- Source material 3 ---\nSOURCE_THREE ${'c'.repeat(8000)}`
    ].join('');
    const compacted = compactSearchEvidence(raw, 6000);

    assert(compacted.includes('SEARCH_STATUS: RESULTS_FOUND'));
    assert(compacted.includes('SOURCE_ONE'));
    assert(compacted.includes('SOURCE_TWO'));
    assert(compacted.includes('SOURCE_THREE'));
    assert(compacted.length < raw.length);
}

async function testEarlierConversationIsRenderedAsDialogueNotFact() {
    const worldModel = require('../src/memory/worldModel');
    const originalGetAll = worldModel.getAll;
    worldModel.getAll = async () => [];

    try {
        const { buildContext } = require('../src/core/contextBuilder');
        const prompt = await buildContext({
            mode: 'casual',
            intent: { intent: 'conversation' },
            responseStyle: null,
            memoryResult: null,
            toolResult: { needsTool: false },
            userInput: 'What did we decide about retrieval?',
            history: [],
            policy: 'NONE',
            workingContext: {},
            preprocessed: {
                relevantMemory: {
                    hotState: { activeProject: null, activeFiles: [], currentTask: null },
                    state: [],
                    personal: [],
                    projects: [],
                    projectNames: {},
                    activeProjectKey: null,
                    knowledge: [],
                    procedures: [],
                    features: [],
                    reflections: [],
                    conversationHistory: [
                        { role: 'user', content: 'Keep older-message retrieval session-scoped.' },
                        { role: 'assistant', content: 'I will keep cross-session continuity in reflections.' }
                    ]
                }
            }
        });

        assert(prompt.includes('RELEVANT EARLIER CONVERSATION (CURRENT SESSION)'));
        assert(prompt.includes('User: Keep older-message retrieval session-scoped.'));
        assert(prompt.includes('Alice: I will keep cross-session continuity in reflections.'));
        assert(prompt.includes('not as independently verified long-term memory'));
    } finally {
        worldModel.getAll = originalGetAll;
    }
}

async function testStructuredReflectionEvidenceIsRendered() {
    const worldModel = require('../src/memory/worldModel');
    const originalGetAll = worldModel.getAll;
    worldModel.getAll = async () => [];

    try {
        const { buildContext } = require('../src/core/contextBuilder');
        const prompt = await buildContext({
            mode: 'casual',
            intent: { intent: 'conversation' },
            responseStyle: null,
            memoryResult: null,
            toolResult: { needsTool: false },
            userInput: 'What was the label in the previous completed conversation?',
            history: [],
            policy: 'NONE',
            workingContext: {},
            preprocessed: {
                relevantMemory: {
                    hotState: { activeProject: null, activeFiles: [], currentTask: null },
                    state: [], personal: [], projects: [], projectNames: {},
                    activeProjectKey: null, knowledge: [], procedures: [], features: [],
                    conversationHistory: [],
                    reflections: [{
                        session_id: 1176,
                        timestamp: '2026-09-01T16:15:50.112Z',
                        subject: 'general',
                        category: 'feature_work',
                        summary: 'The session tested reflection continuity.',
                        topics: ['reflection'],
                        anchors: ['test_label: Willow'],
                        comparisons: ['Conversation closure versus application shutdown.'],
                        decisions: ['Validate conversation closure first.'],
                        open_loops: []
                    }]
                }
            }
        });

        assert(prompt.includes('session 1176'));
        assert(prompt.includes('test_label: Willow'));
        assert(prompt.includes('Conversation closure versus application shutdown.'));
        assert(prompt.indexOf('Structured evidence:') < prompt.indexOf('Lossy overview:'));
        assert(prompt.includes('structured reflection evidence outranks'));
        assert(prompt.includes('available reflection does not include it'));
        assert(prompt.includes('Do not claim a database-wide search'));
    } finally {
        worldModel.getAll = originalGetAll;
    }
}

async function testFailedCurrentSearchGetsHardEvidenceDirective() {
    const worldModel = require('../src/memory/worldModel');
    const originalGetAll = worldModel.getAll;
    worldModel.getAll = async () => [];

    try {
        const { buildContext } = require('../src/core/contextBuilder');
        const prompt = await buildContext({
            mode: 'casual',
            intent: { intent: 'search' },
            responseStyle: null,
            memoryResult: null,
            toolResult: {
                needsTool: true,
                toolName: 'search_web',
                toolResult: 'SEARCH_STATUS: NO_RESULTS\nNo verified web evidence was returned.'
            },
            userInput: 'What is the latest stable release?',
            history: [],
            policy: 'LIGHT',
            workingContext: {},
            preprocessed: {
                relevantMemory: {
                    hotState: { activeProject: null, activeFiles: [], currentTask: null },
                    state: [], personal: [], projects: [], projectNames: {},
                    activeProjectKey: null, knowledge: [], procedures: [],
                    features: [], reflections: [], conversationHistory: []
                }
            }
        });

        assert(prompt.includes('CURRENT INFORMATION:'));
        assert(/say the current answer could not be verified/i.test(prompt));
        assert(/do not substitute an old remembered fact/i.test(prompt));
    } finally {
        worldModel.getAll = originalGetAll;
    }
}

async function testUserDesignNoteSuppressesRetrievedClaims() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => {
        if (store === 'user_profile') return [];
        if (store === 'project_memory') return [{ id: 1, score: 0,
            data: { project_key: 'atlas', subject: 'memory', key: 'legacy_rule', value: 'Already implemented' }
        }];
        if (store === 'knowledge_library') return [{ id: 2, score: 0,
            data: { subject: 'knowledge', key: 'old_claim', value: 'Auto-expires after 7 days' }
        }];
        if (store === 'procedural_memory') return [{ id: 3, score: 0,
            data: { trigger: 'knowledge is stale', action: 'expire it after 7 days' }
        }];
        return [];
    };
    projectRegistry.getAllProjects = async () => [{
        project_key: 'atlas', name: 'Atlas', aliases: []
    }];

    try {
        const result = await getRelevantContext(
            'We still need to determine how stale knowledge should be expired, superseded, or reverified.',
            [],
            { intent: 'conversation' },
            { sessionId: 1211, workingMemory: { getRelevant: async () => [] } }
        );

        assert.deepStrictEqual(result.projects, []);
        assert.deepStrictEqual(result.knowledge, []);
        assert.deepStrictEqual(result.procedures, []);
        assert.deepStrictEqual(result.features, []);
        assert.deepStrictEqual(result.reflections, []);
        assert.deepStrictEqual(result.conversationHistory, []);
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
    }
}

async function testUserDesignNoteGetsGroundingDirective() {
    const worldModel = require('../src/memory/worldModel');
    const originalGetAll = worldModel.getAll;
    worldModel.getAll = async () => [];

    try {
        const { buildContext } = require('../src/core/contextBuilder');
        const prompt = await buildContext({
            mode: 'casual',
            intent: { intent: 'conversation' },
            responseStyle: null,
            memoryResult: null,
            toolResult: { needsTool: false },
            userInput: 'Unverified search results should not be treated as established facts.',
            history: [],
            policy: 'NONE',
            workingContext: {},
            preprocessed: {
                relevantMemory: {
                    hotState: { activeProject: null, activeFiles: [], currentTask: null },
                    state: [], personal: [], projects: [], projectNames: {},
                    activeProjectKey: null, knowledge: [], procedures: [],
                    features: [], reflections: [], conversationHistory: []
                }
            }
        });

        assert(prompt.includes('CURRENT USER NOTE:'));
        assert(prompt.includes('new policy'));
        assert(prompt.includes('Do not say ATLAS already implements it'));
        assert(prompt.includes('cannot prove implementation'));
    } finally {
        worldModel.getAll = originalGetAll;
    }
}

async function testKnowledgeRetrievalQuarantinesUnverifiedRows() {
    const memoryCache = require('../src/core/memoryCache');
    const projectRegistry = require('../src/memory/projectRegistry');
    const originalGetMemory = memoryCache.getMemory;
    const originalGetAllProjects = projectRegistry.getAllProjects;

    memoryCache.getMemory = async store => {
        if (store !== 'knowledge_library') return [];
        return [
            {
                id: 1,
                score: 0,
                data: {
                    id: 1,
                    category: 'technology',
                    subject: 'ollama',
                    key: 'latest_stable_version',
                    value: '195.6',
                    topics: ['ollama'],
                    type: 'fact',
                    confidence: 0.9,
                    source: 'web_search: latest stable Ollama release',
                    source_type: 'web_search'
                }
            },
            {
                id: 2,
                score: 0,
                data: {
                    id: 2,
                    category: 'programming',
                    subject: 'javascript',
                    key: 'runtime_model',
                    value: 'JavaScript uses an event loop.',
                    topics: ['javascript', 'event_loop'],
                    type: 'fact',
                    confidence: 0.95,
                    source: 'MDN event loop guide',
                    source_type: 'document'
                }
            }
        ];
    };
    projectRegistry.getAllProjects = async () => [];

    try {
        const result = await getRelevantContext(
            'How does the JavaScript runtime model work?',
            [],
            { intent: 'conversation' },
            { sessionId: 1300, workingMemory: { getRelevant: async () => [] } }
        );

        assert.deepStrictEqual(result.knowledge.map(row => row.id), [2]);
    } finally {
        memoryCache.getMemory = originalGetMemory;
        projectRegistry.getAllProjects = originalGetAllProjects;
    }
}

async function run() {
    testUserNoteClassification();
    testRecentTurnsAreRemovedByExactRowIdentity();
    testConversationScoringUsesTopicsAndImportance();
    testInvalidationClearsBothCacheLayers();
    testRecentSessionReferenceUsesNewestReflection();
    testExactSessionReferenceHasOneScope();
    testPreviousConversationUsesTheActualOutgoingSession();
    testReflectionScopeCarriesAcrossFollowUps();
    testUserAttributedQuestionsKeepReflectionScope();
    testOrdinaryStatementsDoNotActivateOldReflections();
    await testRestartFallbackBecomesTheFollowUpScope();
    await testScopedReflectionLookupExcludesCompetingMemoryStores();
    await testConversationTitleSelectsAndCarriesOneReflection();
    await testMissingConversationTitleDoesNotUseAnotherReflection();
    testSearchCompactionPreservesEverySource();
    await testEarlierConversationIsRenderedAsDialogueNotFact();
    await testStructuredReflectionEvidenceIsRendered();
    await testFailedCurrentSearchGetsHardEvidenceDirective();
    await testUserDesignNoteSuppressesRetrievedClaims();
    await testUserDesignNoteGetsGroundingDirective();
    await testKnowledgeRetrievalQuarantinesUnverifiedRows();
    console.log('conversationContextRetrieval.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
