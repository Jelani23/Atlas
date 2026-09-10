const assert = require('node:assert/strict');
const { createGenerationCache } = require('../src/core/generationCache');
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
async function run() {
    const cache = createGenerationCache();
    const first = deferred();
    let calls = 0;
    const load = () => { calls++; return calls === 1 ? first.promise : ['fresh']; };
    const a = cache.get('knowledge', load);
    const b = cache.get('knowledge', load);
    await Promise.resolve();
    assert.equal(calls, 1, 'Concurrent requests share one load');
    cache.invalidate('knowledge');
    const c = cache.get('knowledge', load);
    assert.deepEqual(await c, ['fresh']);
    first.resolve(['stale']);
    assert.deepEqual(await a, ['fresh']);
    assert.deepEqual(await b, ['fresh']);
    assert.deepEqual(cache.peek('knowledge'), ['fresh']);
    assert.equal(calls, 2, 'Old callers reuse the new generation');

    const old = deferred();
    const pending = cache.get('profile', () => old.promise);
    await Promise.resolve();
    cache.clear();
    await cache.get('profile', async () => ['new profile']);
    old.reject(new Error('Old failed request'));
    assert.deepEqual(await pending, ['new profile'], 'Invalidated errors cannot erase newer data');
    assert.equal(cache.peek('knowledge'), undefined, 'Global clear invalidates all stores');

    const error = new Error('Database offline');
    const failedReads = [cache.get('failed', () => { throw error; }), cache.get('failed', () => { throw error; })];
    const failures = await Promise.allSettled(failedReads);
    assert.ok(failures.every(result => result.status === 'rejected' && result.reason === error));
    assert.equal(cache.peek('failed'), undefined, 'Errors are not cached as empty success');
    assert.deepEqual(await cache.get('failed', async () => []), [], 'A later read can retry and cache a real empty result');
    const churn = createGenerationCache({ maxAttempts: 3 });
    let tries = 0;
    await assert.rejects(churn.get('busy', async () => {
        tries++; churn.invalidate('busy'); return ['obsolete'];
    }), /repeatedly invalidated/);
    assert.equal(tries, 3, 'Repeated writes cannot cause an unbounded retry loop');
    assert.equal(churn.peek('busy'), undefined);
    console.log('generationCache.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
