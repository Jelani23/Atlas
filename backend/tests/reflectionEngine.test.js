const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
    chunkHistory,
    parseReflection,
    summarizeHistory,
    generateReflection,
    groundReflection,
    extractNamedAnchors,
    extractUserCommitments,
    REFLECTION_SCHEMA_VERSION
} = require('../src/memory/reflectionEngine');
const reflectionJournal = require('../src/memory/reflectionJournal');

function validReflection(summary = 'The session established a durable reflection lifecycle and retry strategy.') {
    return JSON.stringify({
        summary,
        category: 'Feature Work',
        subject: 'Atlas',
        topics: ['Reflection Retrieval', 'session lifecycle'],
        anchors: ['test_label: Willow'],
        decisions: ['Validate conversation closure first.'],
        comparisons: ['Conversation closure versus application shutdown.'],
        open_loops: []
    });
}

function testAssistantClarificationDoesNotCreateOpenWork() {
    const grounded = groundReflection({
        summary: 'The user recorded a decision.',
        open_loops: ['Clarify what the user meant.']
    }, [
        { role: 'user', content: 'We selected conversation closure first.' },
        { role: 'assistant', content: 'Could you clarify what you mean?' }
    ]);

    assert.deepStrictEqual(grounded.open_loops, []);
}

function testNamedAnchorsKeepTheirRole() {
    const history = [
        { role: 'user', content: "This conversation's reflection test label is Willow." },
        { role: 'assistant', content: 'Understood.' }
    ];

    assert.deepStrictEqual(extractNamedAnchors(history), ['test_label: Willow']);

    const grounded = groundReflection({
        anchors: ['Willow', 'conversation closure'],
        open_loops: []
    }, history);
    assert.deepStrictEqual(
        grounded.anchors,
        ['test_label: Willow', 'conversation closure']
    );
}

function testUserComparisonsAndDecisionsStayExact() {
    const commitments = extractUserCommitments([
        { role: 'user', content: 'We compared conversation closure with application shutdown.' },
        { role: 'assistant', content: 'That means session recall versus termination.' },
        { role: 'user', content: 'We selected conversation closure as the first path to validate.' }
    ]);

    assert.deepStrictEqual(
        commitments.comparisons,
        ['conversation closure vs application shutdown']
    );
    assert.deepStrictEqual(
        commitments.decisions,
        ['We selected conversation closure as the first path to validate']
    );
}

function testUserOpenLoopsStayExact() {
    const history = [
        { role: 'user', content: 'We still need to validate previous-conversation retrieval.' },
        { role: 'assistant', content: 'That is already complete.' }
    ];
    const commitments = extractUserCommitments(history);
    const grounded = groundReflection({
        open_loops: ['Nothing remains.']
    }, history);

    assert.deepStrictEqual(
        commitments.openLoops,
        ['We still need to validate previous-conversation retrieval']
    );
    assert.deepStrictEqual(grounded.open_loops, commitments.openLoops);
}

function testStrictParsingAndNormalization() {
    const parsed = parseReflection(validReflection());
    assert(parsed);
    assert.strictEqual(parsed.category, 'feature_work');
    assert.strictEqual(parsed.subject, 'atlas');
    assert.deepStrictEqual(parsed.topics, ['reflection_retrieval', 'session_lifecycle']);
    assert.deepStrictEqual(parsed.anchors, ['test_label: Willow']);
    assert.deepStrictEqual(
        parsed.comparisons,
        ['Conversation closure versus application shutdown.']
    );
    assert.strictEqual(parsed.schema_version, REFLECTION_SCHEMA_VERSION);

    assert.strictEqual(parseReflection('not json'), null);
    assert.strictEqual(parseReflection(JSON.stringify({
        summary: 'The session involved various tasks and interactions.',
        category: 'general',
        subject: 'general',
        topics: ['misc']
    })), null);
}

async function testLegacyReflectionCanBeRegenerated() {
    const originalGet = reflectionJournal.getForSession;
    const originalReplace = reflectionJournal.replace;
    let replacement = null;

    reflectionJournal.getForSession = async () => ({
        session_id: 1176,
        schema_version: 1,
        summary: 'Old lossy summary.'
    });
    reflectionJournal.replace = async entry => {
        replacement = entry;
        return true;
    };

    try {
        const result = await generateReflection(1176, [
            { role: 'user', content: 'This conversation reflection test label is Willow.' },
            { role: 'assistant', content: 'Understood.' },
            { role: 'user', content: 'We compared conversation closure with application shutdown.' }
        ], { complete: async () => validReflection() });

        assert.strictEqual(result.status, 'updated');
        assert(replacement);
        assert.deepStrictEqual(replacement.anchors, ['test_label: Willow']);
        assert.deepStrictEqual(
            replacement.comparisons,
            ['conversation closure vs application shutdown']
        );
        assert.strictEqual(replacement.schemaVersion, REFLECTION_SCHEMA_VERSION);
        assert.strictEqual(replacement.sourceMessageCount, 3);
    } finally {
        reflectionJournal.getForSession = originalGet;
        reflectionJournal.replace = originalReplace;
    }
}

function testChunkingPreservesLongTranscript() {
    const history = [
        { role: 'user', content: `EARLY-${'a'.repeat(3100)}` },
        { role: 'assistant', content: `MIDDLE-${'b'.repeat(3100)}` },
        { role: 'user', content: `LATE-${'c'.repeat(3100)}` }
    ];
    const chunks = chunkHistory(history, 2400);

    assert(chunks.length > 1);
    const reconstructed = chunks.flat()
        .reduce((byRole, message) => {
            byRole[message.role] = (byRole[message.role] || '') + message.content;
            return byRole;
        }, {});

    assert(reconstructed.user.includes('EARLY-'));
    assert(reconstructed.user.includes('LATE-'));
    assert(reconstructed.assistant.includes('MIDDLE-'));
    assert.strictEqual(
        chunks.flat().reduce((total, message) => total + message.content.length, 0),
        history.reduce((total, message) => total + message.content.length, 0)
    );
}

async function testLongHistoryUsesChunkThenMerge() {
    let calls = 0;
    const complete = async () => {
        calls += 1;
        return validReflection(
            calls >= 3
                ? 'The final reflection retained decisions from the full multi-chunk session.'
                : `Chunk ${calls} preserved its portion of the session.`
        );
    };

    const result = await summarizeHistory([
        { role: 'user', content: `EARLY_DECISION ${'a'.repeat(2600)}` },
        { role: 'assistant', content: `MIDDLE_CONTEXT ${'b'.repeat(2600)}` },
        { role: 'user', content: `LATE_DECISION ${'c'.repeat(2600)}` }
    ], { maxChunkChars: 2400, complete });

    assert(calls >= 3, 'Expected multiple chunk summaries plus a final merge.');
    assert(result.summary.includes('full multi-chunk session'));
}

async function run() {
    testStrictParsingAndNormalization();
    testAssistantClarificationDoesNotCreateOpenWork();
    testNamedAnchorsKeepTheirRole();
    testUserComparisonsAndDecisionsStayExact();
    testUserOpenLoopsStayExact();
    testChunkingPreservesLongTranscript();
    await testLongHistoryUsesChunkThenMerge();
    await testLegacyReflectionCanBeRegenerated();
    console.log('reflectionEngine.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
