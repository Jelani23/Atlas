const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { auditKnowledgeRows } = require('../src/memory/knowledgeAudit');
const { getSearchTerms, rankSearchResults } = require('../src/memory/knowledgeLibrary');

const report = auditKnowledgeRows([
    {
        id: 1,
        category: 'technology',
        subject: 'ollama',
        key: 'latest_stable_version',
        value: 'Ollama v0.1.35 is the latest stable release.',
        topics: [],
        type: 'fact',
        confidence: 0.9,
        source: null,
        source_type: 'web_search'
    },
    {
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
    },
    {
        id: 3,
        category: 'general',
        subject: 'atlas',
        key: 'memory_rule',
        value: 'Old migrated statement.',
        topics: ['atlas'],
        type: 'fact',
        confidence: 1,
        source: null,
        source_type: 'conversation'
    },
    {
        id: 4,
        category: 'technology',
        subject: 'ollama',
        key: 'latest_stable_version',
        value: 'v1.2.3',
        topics: ['ollama', 'release'],
        type: 'fact',
        confidence: 0.95,
        source: 'https://ollama.com/download',
        source_type: 'web_search',
        verification_status: 'verified',
        verification_method: 'web_search_v2',
        verification_sources: [{ url: 'https://ollama.com/download' }],
        expires_at: '2099-01-01T00:00:00Z'
    }
]);

assert.strictEqual(report.summary.total, 4);
assert.strictEqual(report.summary.flagged, 3);
assert.strictEqual(report.summary.unflagged, 1);
assert.strictEqual(report.summary.retrieval_quarantined, 2);
assert.strictEqual(report.summary.retrieval_eligible, 2);
assert.strictEqual(report.summary.issues.missing_provenance, 2);
assert.strictEqual(report.summary.issues.time_sensitive, 2);
assert.strictEqual(report.summary.issues.weak_source_marked_fact, 2);
assert.strictEqual(report.summary.issues.legacy_fact_without_source, 1);
assert.deepStrictEqual(report.records[1].issues, []);
assert.strictEqual(report.records[0].retrieval_blocked, true);
assert.strictEqual(report.records[1].retrieval_blocked, false);
assert.strictEqual(report.records[3].retrieval_blocked, false);

const searchTerms = getSearchTerms('the latest stable Ollama release');
assert.deepStrictEqual(searchTerms, ['latest', 'stable', 'ollama', 'release']);
assert.deepStrictEqual(
    rankSearchResults([
        { id: 1, category: 'technology', subject: 'ollama_release', key: 'latest_stable_version', value: '195.6', type: 'fact' },
        { id: 2, category: 'programming', subject: 'javascript', key: 'runtime_model', value: 'event loop', type: 'fact' }
    ], searchTerms).map(row => row.id),
    [1]
);

const qwenTerms = getSearchTerms('Search the knowledge library for the latest Qwen models');
assert.deepStrictEqual(
    rankSearchResults([
        { id: 63, category: 'technology', subject: 'ollama_release', key: 'latest_stable_version', value: 'v0.33.1', type: 'fact' },
        { id: 90, category: 'technology', subject: 'qwen_3_8_max', key: 'parameter_count', value: 'Qwen 3.8-Max has 2.4 trillion parameters.', type: 'fact' }
    ], qwenTerms).map(row => row.id),
    [90]
);

console.log('knowledgeAuditReport.test.js: all assertions passed');
