const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { ReflectionWorker } = require('../src/memory/reflectionWorker');

async function testSuccessfulJobCompletes() {
    const calls = [];
    const sessions = {
        claimNextReflectionSession: async () => ({ id: 42 }),
        getSessionMessages: async () => [
            { role: 'user', content: 'First decision' },
            { role: 'assistant', content: 'Acknowledged' },
            { role: 'user', content: 'Final decision' }
        ],
        markReflectionComplete: async id => calls.push(['complete', id]),
        markReflectionFailed: async (id, error) => calls.push(['failed', id, error])
    };
    const engine = {
        generateReflection: async (id, history) => {
            calls.push(['generate', id, history.length]);
            return { status: 'saved' };
        }
    };
    const worker = new ReflectionWorker({ sessions, engine });
    const result = await worker.processOne();
    worker.shutdown();

    assert.deepStrictEqual(result, { status: 'complete', sessionId: 42 });
    assert.deepStrictEqual(calls, [
        ['generate', 42, 3],
        ['complete', 42]
    ]);
}

async function testFailedJobRemainsRetryable() {
    const calls = [];
    const sessions = {
        claimNextReflectionSession: async () => ({ id: 84 }),
        getSessionMessages: async () => [
            { role: 'user', content: 'A' },
            { role: 'assistant', content: 'B' },
            { role: 'user', content: 'C' }
        ],
        markReflectionComplete: async id => calls.push(['complete', id]),
        markReflectionFailed: async (id, error) => calls.push(['failed', id, error])
    };
    const engine = {
        generateReflection: async () => {
            throw new Error('invalid structured output');
        }
    };
    const worker = new ReflectionWorker({ sessions, engine });
    const result = await worker.processOne();
    worker.shutdown();

    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(calls, [
        ['failed', 84, 'invalid structured output']
    ]);
}

async function testSpecificSessionDoesNotClaimOlderWork() {
    const calls = [];
    const sessions = {
        claimReflectionSession: async id => {
            calls.push(['claim', id]);
            return { id, reflection_attempts: 1 };
        },
        getSessionMessages: async id => [
            { role: 'user', content: `Label for ${id}` },
            { role: 'assistant', content: 'Acknowledged' },
            { role: 'user', content: 'Close it' }
        ],
        markReflectionComplete: async id => calls.push(['complete', id]),
        markReflectionFailed: async () => {}
    };
    const engine = {
        generateReflection: async id => {
            calls.push(['generate', id]);
            return { status: 'saved' };
        }
    };
    const worker = new ReflectionWorker({ sessions, engine });
    const result = await worker.processSession(1187);
    worker.shutdown();

    assert.deepStrictEqual(result, { status: 'complete', sessionId: 1187 });
    assert.deepStrictEqual(calls, [
        ['claim', 1187],
        ['generate', 1187],
        ['complete', 1187]
    ]);
}

async function testFailedBackfillReturnsToBackfillQueue() {
    const calls = [];
    const sessions = {
        claimReflectionBackfillSession: async id => ({ id, reflection_attempts: 1 }),
        getSessionMessages: async () => [
            { role: 'user', content: 'Historical topic' },
            { role: 'assistant', content: 'Reply' },
            { role: 'user', content: 'Decision' }
        ],
        markReflectionComplete: async () => {},
        markReflectionBackfillFailed: async (id, error) => calls.push(['backfill_failed', id, error]),
        markReflectionFailed: async () => calls.push(['live_failed'])
    };
    const engine = {
        generateReflection: async () => {
            throw new Error('bad historical output');
        }
    };
    const worker = new ReflectionWorker({ sessions, engine });
    const result = await worker.processBackfillSession(90);
    worker.shutdown();

    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(calls, [['backfill_failed', 90, 'bad historical output']]);
}

async function run() {
    await testSuccessfulJobCompletes();
    await testFailedJobRemainsRetryable();
    await testSpecificSessionDoesNotClaimOlderWork();
    await testFailedBackfillReturnsToBackfillQueue();
    console.log('reflectionWorker.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
