const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { resolve } = require('../src/intent/intentResolver');
const planner = require('../src/planner/planner');

function assertConversationRoute(message) {
    const intent = resolve(message);
    assert.strictEqual(
        intent.state,
        'UNKNOWN',
        `Expected a conversation/retrieval route for: ${message}\n${JSON.stringify(intent)}`
    );
    assert.strictEqual(intent.winner, null);
    assert.strictEqual(intent.llmRequired, true);
}

async function run() {
    // Generic domain vocabulary must not manufacture unrelated file-tool
    // candidates. These are complete informational requests that need normal
    // context retrieval, not clarification about a filesystem action.
    assertConversationRoute(
        'What did we compare in the previous conversation, and which path did we choose to validate first?'
    );
    assertConversationRoute('Which approach did we validate during our last discussion?');
    assertConversationRoute('Explain how validation differs from verification.');
    assert.strictEqual(
        resolve('Read memoryCache.js and tell me what it does').winner,
        'readCode',
        'A FILE entity must not nominate checkSyntax without a syntax-check trigger.'
    );

    const retrospective = resolve(
        'What did we compare in the previous conversation, and which path did we choose to validate first?'
    );
    const planned = await planner.route(retrospective, 'What did we compare in the previous conversation?');
    assert.strictEqual(planned.shortCircuit, undefined);
    assert.strictEqual(planned.toolName, undefined);

    // Tool-specific triggers and entities still retain deterministic routing.
    assert.strictEqual(resolve('What files changed?').winner, 'getChangedFiles');
    assert.strictEqual(resolve('Show me the directory tree').winner, 'getDirectoryTree');
    assert.strictEqual(resolve('Check the syntax of src/server.js').winner, 'checkSyntax');
    assert.strictEqual(resolve('Search the web for the latest Ollama release').winner, 'webSearch');
    assert.strictEqual(resolve('Convert 50 USD to EUR').winner, 'convertCurrency');

    console.log('intentResolverDomainEvidence.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
