const assert = require('assert');

const {
    extractSourceUrls,
    buildVerificationQueries,
    getExpiry,
    validateEvaluation
} = require('../src/memory/knowledgeVerificationPolicy');

const record = {
    subject: 'ollama_release',
    key: 'latest_stable_version',
    value: 'v0.33.2',
    topics: ['ollama', 'release']
};

assert.deepStrictEqual(
    extractSourceUrls('Source URL: https://ollama.com/blog/release. Duplicate: https://ollama.com/blog/release'),
    ['https://ollama.com/blog/release']
);
assert.deepStrictEqual(buildVerificationQueries(record), [
    `ollama latest stable version ${new Date().getFullYear()}`,
    'ollama official latest stable version',
    'ollama official releases'
]);
assert.deepStrictEqual(buildVerificationQueries({
    ...record,
    topics: ['qwen', 'dark_mode', 'macos_compatibility']
}), [
    `ollama latest stable version ${new Date().getFullYear()}`,
    'ollama official latest stable version',
    'ollama official releases'
]);
assert(getExpiry(record, new Date('2026-09-01T00:00:00Z')));
assert.strictEqual(
    getExpiry({ subject: 'javascript', key: 'runtime_model', value: 'event loop', topics: [] }),
    null
);

const evidence = 'Source URL: https://ollama.com/download\nOllama v1.2.3 is available.';
assert.deepStrictEqual(
    validateEvaluation({
        verdict: 'updated',
        proposed_value: 'v1.2.3',
        confidence: 0.95,
        reason: 'The official page lists a newer version.',
        supporting_urls: ['https://ollama.com/download', 'https://invented.example/source']
    }, evidence, record),
    {
        verdict: 'updated',
        proposed_value: 'v1.2.3',
        confidence: 0.95,
        reason: 'The official page lists a newer version.',
        supporting_urls: ['https://ollama.com/download']
    }
);
assert.strictEqual(
    validateEvaluation({
        verdict: 'confirmed',
        proposed_value: '',
        confidence: 0.9,
        reason: 'Unsupported URL.',
        supporting_urls: ['https://invented.example/source']
    }, evidence, record).verdict,
    'insufficient'
);

assert.strictEqual(
    validateEvaluation({
        verdict: 'confirmed',
        proposed_value: '',
        confidence: 0.95,
        reason: 'A blog repeats the stored claim.',
        supporting_urls: ['https://example.com/ollama-version']
    }, 'Source URL: https://example.com/ollama-version\nOllama v0.33.2 is available.', record).verdict,
    'insufficient'
);

const conflictingEvidence = [
    'Source URL: https://example.com/ollama-version',
    'A blog calls v0.33.2 the latest release.',
    'Source URL: https://github.com/ollama/ollama/releases',
    'The official release page lists v0.32.8.'
].join('\n');
assert.strictEqual(
    validateEvaluation({
        verdict: 'confirmed',
        proposed_value: '',
        confidence: 0.95,
        reason: 'The blog supports the stored value.',
        supporting_urls: [
            'https://example.com/ollama-version',
            'https://github.com/ollama/ollama/releases'
        ]
    }, conflictingEvidence, record).verdict,
    'insufficient'
);

console.log('knowledgeVerificationPolicy.test.js: all assertions passed');
