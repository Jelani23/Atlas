const assert = require('node:assert/strict');
const priority = require('../src/models/localModelPriority');
(async () => {
    let attempts = 0, start, aborted = false, releaseForeground;
    const started = new Promise(resolve => { start = resolve; });
    const job = priority.runBackground(() => priority.complete(({ signal }) => {
        attempts++;
        if (attempts > 1) return 'background result';
        start();
        return new Promise((_, reject) => signal.addEventListener('abort', () => {
            aborted = true; reject(new Error('preempted'));
        }, { once: true }));
    }));
    await started;
    const foreground = priority.complete(async () => {
        assert.equal(aborted, true);
        await new Promise(resolve => { releaseForeground = resolve; });
        return 'foreground result';
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 1, 'Background must stay paused while user work runs');
    releaseForeground();
    assert.equal(await foreground, 'foreground result');
    assert.equal(await job, 'background result');
    assert.equal(attempts, 2);
    let calls = 0;
    await assert.rejects(priority.runBackground(() => priority.complete(async () => {
        calls++; throw new Error('real failure');
    })), /real failure/);
    assert.equal(calls, 1, 'Ordinary failures must not be retried');
    const release = priority.enterForeground();
    const controller = new AbortController();
    const cancelled = priority.runBackground(() => priority.complete(() => assert.fail('Cancelled work ran'), { signal: controller.signal }));
    controller.abort();
    await assert.rejects(cancelled);
    release();
    console.log('Local model priority: foreground preemption, background resumption, failure and cancellation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
