const assert = require('assert');

// contextManager imports the real Supabase-backed stores at module load.
// These syntactically valid placeholders let this pure helper test load the
// module without contacting a database.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
    removeRecentConversationMessages,
    scoreConversationMessage
} = require('../src/core/contextManager');
const { extractKeywords } = require('../src/utils/keywordExtractor');
const { compactSearchEvidence } = require('../src/core/contextBuilder');

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

async function run() {
    testRecentTurnsAreRemovedByExactRowIdentity();
    testConversationScoringUsesTopicsAndImportance();
    testInvalidationClearsBothCacheLayers();
    testSearchCompactionPreservesEverySource();
    await testEarlierConversationIsRenderedAsDialogueNotFact();
    await testFailedCurrentSearchGetsHardEvidenceDirective();
    console.log('conversationContextRetrieval.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
