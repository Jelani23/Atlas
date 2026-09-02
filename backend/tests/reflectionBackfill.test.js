const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { parseArgs, shorten, run } = require('../scripts/backfillReflections');

assert.deepStrictEqual(parseArgs([]), {
    apply: false,
    details: false,
    skip: false,
    limit: 5,
    sessionIds: []
});
assert.deepStrictEqual(parseArgs(['--limit', '3', '--ids', '12, 15', '--details', '--apply']), {
    apply: true,
    details: true,
    skip: false,
    limit: 3,
    sessionIds: [12, 15]
});
assert.throws(() => parseArgs(['--limit', '0']), /between 1 and 50/);
assert.throws(() => parseArgs(['--skip']), /requires explicit --ids/);
assert.throws(() => parseArgs(['--apply', '--skip', '--ids', '1']), /either --apply or --skip/);
assert.strictEqual(shorten('  short   preview  '), 'short preview');

async function testPreviewDoesNotQueueAnything() {
    const calls = [];
    const sessions = {
        listReflectionBackfillCandidates: async (limit, ids) => {
            calls.push(['list', limit, ids]);
            return [{ id: 20, messageCount: 6, title: 'Test', preview: 'First message' }];
        },
        getSessionMessages: async id => {
            calls.push(['history', id]);
            return [{ role: 'user', content: 'First message' }];
        },
        claimReflectionBackfillSession: async id => calls.push(['claim', id])
    };

    const result = await run(['--limit', '1', '--details'], { sessions, engine: {} });
    assert.strictEqual(result.preview, true);
    assert.deepStrictEqual(calls, [['list', 1, []], ['history', 20]]);
}

async function testApplyProcessesOnlyReviewedCandidates() {
    const calls = [];
    const sessions = {
        listReflectionBackfillCandidates: async () => [
            { id: 20, messageCount: 6, title: 'First', preview: 'A' },
            { id: 21, messageCount: 2, title: 'Second', preview: 'B' }
        ],
        claimReflectionBackfillSession: async id => {
            calls.push(['claim', id]);
            return id === 20
                ? { id, reflection_attempts: 1 }
                : { id, reflection_attempts: 0, skipReason: 'too_short' };
        },
        getSessionMessages: async id => [
            { role: 'user', content: `Session ${id}` },
            { role: 'assistant', content: 'Reply' },
            { role: 'user', content: 'Decision' }
        ],
        markReflectionComplete: async id => calls.push(['complete', id]),
        markReflectionBackfillFailed: async () => {}
    };
    const engine = {
        generateReflection: async id => {
            calls.push(['generate', id]);
            return { status: 'saved' };
        }
    };

    const result = await run(['--apply'], { sessions, engine });
    assert.deepStrictEqual(result.results.map(item => item.status), ['complete', 'skipped']);
    assert.deepStrictEqual(calls, [
        ['claim', 20],
        ['generate', 20],
        ['complete', 20],
        ['claim', 21]
    ]);
}

async function testSkipRequiresAndUsesExactCandidates() {
    const calls = [];
    const sessions = {
        listReflectionBackfillCandidates: async (limit, ids) => {
            calls.push(['list', limit, ids]);
            return ids.map(id => ({ id, messageCount: 4, title: null, preview: 'Old test' }));
        },
        skipReflectionBackfill: async id => {
            calls.push(['skip', id]);
            return { sessionId: id, status: 'skipped' };
        }
    };

    const result = await run(['--skip', '--ids', '1,3'], { sessions, engine: {} });
    assert.strictEqual(result.preview, false);
    assert.deepStrictEqual(result.results.map(item => item.sessionId), [1, 3]);
    assert.deepStrictEqual(calls, [
        ['list', 5, [1, 3]],
        ['skip', 1],
        ['skip', 3]
    ]);
}

Promise.resolve()
    .then(testPreviewDoesNotQueueAnything)
    .then(testApplyProcessesOnlyReviewedCandidates)
    .then(testSkipRequiresAndUsesExactCandidates)
    .then(() => console.log('reflectionBackfill.test.js: all assertions passed'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
