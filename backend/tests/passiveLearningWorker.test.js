const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { PassiveLearningWorker } = require('../src/learning/worker');

async function main() {
    const events = new EventEmitter();
    const calls = [];
    const repository = {
        claim: async source => { calls.push(['claim', source.id]); return { id: 'run-1', last_fingerprint: null }; },
        finish: async (...args) => calls.push(['finish', ...args])
    };
    const worker = new PassiveLearningWorker({
        enabled: true,
        events,
        repository,
        sources: () => [{ id: 'neuro', url: 'https://vedal.ai/', subjects: ['neuro_sama'] }],
        collect: async () => ({ fingerprint: 'abc', documents: [{ url: 'https://vedal.ai/', text: 'Neuro-sama is an AI VTuber created by Vedal.', publishedAt: null }] }),
        extractor: { extractAndSaveFromSearch: async input => {
            calls.push(['extract', input.allowedSubjects, input.rawResults]);
            return { saved: 1, duplicates: 0 };
        } }
    });
    worker.initialize();
    const result = await worker.processOne();
    await worker.shutdown();
    assert.equal(result.status, 'complete');
    assert.equal(calls[0][0], 'claim');
    assert.equal(calls[1][0], 'extract');
    assert.deepEqual(calls[1][1], ['neuro_sama']);
    assert.match(calls[1][2], /SEARCH_STATUS: RESULTS_FOUND/);
    assert.equal(calls[2][0], 'finish');
    assert.equal(calls[2][1].id, 'run-1');

    const failureCalls = [];
    const failing = new PassiveLearningWorker({
        enabled: true,
        events: new EventEmitter(),
        repository: {
            claim: async () => ({ id: 'run-2', last_fingerprint: null }),
            finish: async (...args) => failureCalls.push(args)
        },
        sources: () => [{ id: 'nba', url: 'https://www.nba.com/news/about', subjects: ['nba'] }],
        collect: async () => { throw new Error('publisher unavailable'); },
        extractor: { extractAndSaveFromSearch: async () => ({ saved: 0 }) }
    });
    failing.initialize();
    const failed = await failing.processOne();
    await failing.shutdown();
    assert.equal(failed.status, 'failed');
    assert.equal(failureCalls[0][0].id, 'run-2');
    assert.equal(failureCalls[0][1], 'failed');
    console.log('passiveLearningWorker.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
