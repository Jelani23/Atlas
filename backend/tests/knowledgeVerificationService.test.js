const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { SEARCH_STATUS } = require('../src/utils/searchEvidence');
const { reverifyKnowledgeRecord } = require('../src/memory/knowledgeVerificationService');

async function testUpdatedClaim() {
    const calls = [];
    const record = {
        id: 64,
        category: 'technology',
        subject: 'ollama_version',
        key: 'latest_stable_version',
        value: 'v0.33.2',
        topics: ['ollama', 'release'],
        verification_attempts: 0
    };
    const repository = {
        getById: async () => ({ ...record }),
        createVerificationRun: async run => { calls.push(['createRun', run]); return 9; },
        beginVerification: async (...args) => { calls.push(['begin', args]); return { ...record, verification_status: 'pending', verification_attempts: 1 }; },
        applyVerification: async (id, update) => {
            calls.push(['apply', id, update]);
            return { ...record, ...update };
        },
        completeVerificationRun: async (id, update) => calls.push(['complete', id, update])
    };
    const searchPipeline = {
        executeSearch: async () => `${SEARCH_STATUS.RESULTS_FOUND}\nSource URL: https://ollama.com/download\nThe current stable release is v1.2.3.`
    };
    const evaluator = {
        evaluateKnowledge: async () => ({
            verdict: 'updated',
            proposed_value: 'v1.2.3',
            confidence: 0.96,
            reason: 'The official download page lists v1.2.3.',
            supporting_urls: ['https://ollama.com/download']
        })
    };

    const result = await reverifyKnowledgeRecord(64, { repository, searchPipeline, evaluator });
    const applied = calls.find(call => call[0] === 'apply')[2];
    const completed = calls.find(call => call[0] === 'complete')[2];

    assert(result.includes('updated and verified'));
    assert.strictEqual(applied.value, 'v1.2.3');
    assert.strictEqual(applied.verification_status, 'verified');
    assert.strictEqual(applied.verification_method, 'web_search_v2');
    assert.deepStrictEqual(applied.verification_sources.map(source => source.url), ['https://ollama.com/download']);
    assert(applied.expires_at);
    assert.strictEqual(completed.status, 'updated');
}

async function testUnsupportedEvidenceStaysUnverified() {
    const record = {
        id: 65,
        category: 'technology',
        subject: 'ollama_version',
        key: 'important_changes',
        value: 'Dark mode changed.',
        topics: ['ollama'],
        verification_attempts: 1
    };
    let applied;
    const repository = {
        getById: async () => ({ ...record }),
        createVerificationRun: async () => 10,
        beginVerification: async () => ({ ...record, verification_status: 'pending', verification_attempts: 2 }),
        applyVerification: async (id, update) => {
            applied = update;
            return { ...record, ...update };
        },
        completeVerificationRun: async () => {}
    };
    const searchPipeline = {
        executeSearch: async () => `${SEARCH_STATUS.RESULTS_FOUND}\nSource URL: https://ollama.com/blog\nA release was published.`
    };
    const evaluator = {
        evaluateKnowledge: async () => ({
            verdict: 'confirmed',
            proposed_value: '',
            confidence: 0.9,
            reason: 'Cited a URL not present in evidence.',
            supporting_urls: ['https://invented.example/source']
        })
    };

    const result = await reverifyKnowledgeRecord(65, { repository, searchPipeline, evaluator });
    assert(result.includes('remains unverified'));
    assert.strictEqual(applied.verification_status, 'unverified');
    assert.deepStrictEqual(applied.verification_sources, []);
}

async function run() {
    await testUpdatedClaim();
    await testUnsupportedEvidenceStaysUnverified();
    console.log('knowledgeVerificationService.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
