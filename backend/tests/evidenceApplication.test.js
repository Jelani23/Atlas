const assert = require('node:assert/strict');
const { EvidencePilot } = require('../src/reasoning/evidencePilot/runner');
const { createApplicationPilot } = require('../src/reasoning/evidencePilot/application');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
(async () => {
    const disabled = createApplicationPilot({ enabled: false, Pilot: class { constructor() { throw new Error('Disabled pilot constructed'); } } });
    assert.equal(await disabled.foreground(() => 7), 7);
    disabled.start(); await disabled.stop();
    assert.deepEqual(disabled.status(), { enabled: false });
    await assert.rejects(disabled.reanalyze(), /disabled/);
    let instance, options;
    const releaseBackground = deferred();
    class ControlledPilot extends EvidencePilot {
        constructor(opts) { super(opts); instance = this; options = opts; }
        async run(_targets, check) { await releaseBackground.promise; check(); return { status: 'complete' }; }
    }
    const queued = [];
    let requests = 0;
    const service = createApplicationPilot({ enabled: true, Pilot: ControlledPilot,
        enqueue: fn => { const result = deferred(); queued.push(async () => { try { result.resolve({ value: await fn() }); } catch (error) { result.resolve({ error }); } }); return result.promise.then(r => { if (r.error) throw r.error; return r.value; }); },
        request: async () => { requests++; return {}; }, log() {} });
    service.start();
    const background = instance.runOnce();
    const rejection = assert.rejects(background, /cancelled/);
    let dispatched = false;
    const foregroundRelease = deferred();
    const foreground = service.foreground(async () => { dispatched = true; await foregroundRelease.promise; throw new Error('Conversation failed'); });
    const foregroundFailure = assert.rejects(foreground, /Conversation failed/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dispatched, false, 'Abort dispatch must not release foreground before transport settlement.');
    releaseBackground.resolve();
    await rejection;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dispatched, true);
    assert.equal(service.status().foregroundCount, 1);
    await service.foreground(async () => assert.equal(service.status().foregroundCount, 2));
    assert.equal(service.status().foregroundCount, 1, 'One overlapping turn must not release another.');
    foregroundRelease.resolve(); await foregroundFailure;
    assert.equal(service.status().foregroundCount, 0, 'Failed turn must release its hold.');
    assert(instance.timer, 'Idle scheduling resumes after final turn settles.');

    const controller = new AbortController();
    const summary = options.summarize([], { signal: controller.signal });
    const cancelled = assert.rejects(summary, /cancelled/);
    controller.abort(); await cancelled;
    await queued.shift()();
    assert.equal(requests, 0, 'Cancelled queued entries must never call Ollama later.');
    const preserved = { audit: { text: 'Original answer' }, packet: { fingerprint: 'original' } };
    const archives = [];
    instance.store = { directory: 'test-store', async read() { return preserved; }, async write(name, value) { archives.push({ name, value }); } };
    const keyBefore = instance.summaryKey;
    const retry = await service.reanalyze('execution');
    assert.equal(retry.status, 'scheduled');
    assert.equal(instance.contextOptions.targetSymbol, '_executeTask');
    assert.equal(instance.contextOptions.includeCallers, true);
    assert.notEqual(instance.summaryKey, keyBefore);
    assert.deepEqual(archives[0].value, preserved);
    assert(archives[0].name.startsWith('review-before-rerun-'));
    await assert.rejects(service.reanalyze('invented'), /Unknown analysis focus/);
    await service.foreground(() => assert.rejects(service.reanalyze(), /busy/));
    await service.stop();
    assert.equal(instance.timer, null);
    assert.equal(service.status().phase, 'stopped');
    await assert.rejects(service.foreground(() => {}), /shutting down/);
    service.start(); assert.equal(instance.enabled, false);
    console.log('Application evidence pilot lifecycle tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
