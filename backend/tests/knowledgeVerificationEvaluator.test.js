const assert = require('assert');
const {
    buildVerificationPrompt,
    evaluateKnowledge
} = require('../src/memory/knowledgeVerificationEvaluator');

const record = {
    category: 'technology',
    subject: 'ollama_release',
    key: 'latest_stable_version',
    value: 'v1.2.3'
};
const now = new Date('2026-09-02T15:00:00Z');
const prompt = buildVerificationPrompt(record, 'Source URL: https://ollama.com', now);
assert(prompt.includes('Runtime current date: 2026-09-02'));
assert(prompt.includes('is not in the future'));

let capturedMessages;
const adapter = {
    async complete(messages) {
        capturedMessages = messages;
        return JSON.stringify({
            verdict: 'insufficient',
            proposed_value: '',
            confidence: 0.5,
            reason: 'Not enough evidence.',
            supporting_urls: []
        });
    }
};

async function run() {
    await evaluateKnowledge(record, 'No decisive evidence.', { adapter, now });
    assert(capturedMessages[1].content.includes('2026-09-02'));
    console.log('knowledgeVerificationEvaluator.test.js passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
