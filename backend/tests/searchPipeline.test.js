const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const searchPipeline = require('../src/planner/searchPipeline');
const {
    SEARCH_STATUS,
    hasVerifiedSearchEvidence
} = require('../src/utils/searchEvidence');
const {
    hasExtractableContent
} = require('../src/memory/searchKnowledgeExtractor');

async function run() {
    const year = String(new Date().getFullYear());
    const queries = await searchPipeline.generateQueries(
        'Search the web for the latest stable Ollama release and briefly summarize what changed.'
    );

    assert.strictEqual(queries.length, 3);
    assert.strictEqual(queries[0], 'the latest stable Ollama release');
    assert(queries.some(query => query.includes(year)), 'temporal search must include runtime year');
    assert(queries.some(query => /official/i.test(query)), 'one query should seek an official source');
    assert(!queries.some(query => /we are generating|the user request|we need to cover/i.test(query)));

    const summaryQueries = await searchPipeline.generateQueries(
        'Search the web for the latest stable Ollama release and summarize the important changes.'
    );
    assert.strictEqual(summaryQueries[0], 'the latest stable Ollama release');

    let calls = 0;
    const noResults = await searchPipeline.executeSearch(queries, {
        delayMs: 0,
        search: async () => {
            calls += 1;
            return 'No direct results found across all search providers.';
        }
    });
    assert.strictEqual(calls, 3);
    assert(noResults.startsWith(SEARCH_STATUS.NO_RESULTS));
    assert.strictEqual(hasVerifiedSearchEvidence(noResults), false);
    assert.strictEqual(
        hasExtractableContent('The latest version is an old remembered release.', noResults),
        false,
        'a synthesized fallback must never qualify failed search output for storage'
    );

    const results = await searchPipeline.executeSearch(['official Ollama releases'], {
        delayMs: 0,
        search: async () => 'Search Results for "official Ollama releases":\n1. Official release notes - version and changes'
    });
    assert(results.startsWith(SEARCH_STATUS.RESULTS_FOUND));
    assert.strictEqual(hasVerifiedSearchEvidence(results), true);
    assert.strictEqual(hasExtractableContent('A supported summary.', results), true);

    console.log('✓ deterministic query generation uses runtime time context without an LLM');
    console.log('✓ failed searches carry NO_RESULTS and cannot become knowledge');
    console.log('✓ verified source material remains eligible for synthesis/extraction');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
