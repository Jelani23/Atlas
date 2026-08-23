const { createModelAdapter } = require('../models/modelAdapter');
const tools = require('../tools');
const { stripThinking } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();
const SEARCH_DELAY = 1000; // Configurable delay (Atlas's suggestion!)

// Query generation is a fast, low-level LLM task - run it on Gemini 2.5
// Flash when a key is configured (no Qwen3 thinking trace on every search),
// otherwise fall back to the default provider.
const queryModelAdapter = process.env.GEMINI_API_KEY
    ? createModelAdapter('gemini')
    : modelAdapter;

// Generates 3 distinct search queries using line-by-line generation
async function generateQueries(message) {
    const prompt = `
        User Request: "${message}"
        Generate 3 distinct, concise search engine queries to find information about this request. Include different perspectives (e.g., the core subject, specific platforms, related terms).
        Output ONE query per line. Do not number them. Do not output any other text.
    `;
    
    try {
        // maxTokens bumped from 150: gemini-3.6-flash reserves a token
        // floor for thinking even at reasoning_effort:'low' (see
        // gemini.js) - 150 left no room for that floor plus 3 query
        // lines, so this call to Gemini specifically (queryModelAdapter)
        // was the "Query generation failed" line seen live.
        const response = await queryModelAdapter.complete([
            { role: 'system', content: 'You are a search query generator.' },
            { role: 'user', content: prompt }
        ], { temperature: 0.2, maxTokens: 900, timeout: 8000 });
        
        // 1. Strip thinking traces completely before processing (handles a
        // stray closing </think> with no opener, which the old paired-tag
        // regex here missed) 
        let cleanResponse = stripThinking(response);
        
        const lines = cleanResponse.split('\n')
            .map(l => l.trim().replace(/^[-*\d.\s]+/, ''))
            .filter(l => l.length > 0 && !l.toLowerCase().startsWith('query') && !l.toLowerCase().includes('do not'));
            
        if (lines.length > 0) {
            return lines.slice(0, 3);
        }
        
        console.log("[SearchPipeline] Query generation failed, using raw message.");
        return [message];
    } catch (e) { 
        console.error("[SearchPipeline] Query generation failed:", e.message);
        return [message]; 
    }
}

// Executes searches sequentially with rate limiting and per-query error handling (Atlas's suggestion!)
async function executeSearch(queries) {
    console.log('[SearchPipeline] Queries:', queries);
    // Phase: framing this as raw research material to be read in full and
    // synthesized into ONE answer (see response/controller.js's "search"
    // style), rather than as 3 independent "Result Sets" to summarize
    // one-by-one - that framing was part of why replies came out reading
    // like three shortened summaries stitched together instead of one
    // comprehended answer.
    let aggregatedResult = "Raw research material gathered from multiple related searches below. Read all of it, cross-reference overlapping/conflicting details, and write ONE complete synthesized answer in your own words - do not summarize each block separately.\n\n";

    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        try {
            console.log(`[SearchPipeline] Executing query ${i+1}: "${q}"`);
            // Phase: this was `tools.webSearch(q)` - but tools.webSearch is
            // the module's full export shape ({ execute, intentSchema }),
            // not a bare function, so this threw "tools.webSearch is not a
            // function" on every single call. The per-query try/catch below
            // silently swallowed that into "Error: Search failed for this
            // query." for EVERY query, every time - meaning this 3-query
            // pipeline has never actually returned a real result. Calling
            // .execute() is the fix.
            const res = await tools.webSearch.execute(q);
            aggregatedResult += `--- Source material ${i+1} (from query: "${q}") ---\n${res}\n\n`;
        } catch (e) {
            console.error(`[SearchPipeline] Failed to execute query ${i+1}: "${q}"`, e.message);
            aggregatedResult += `--- Source material ${i+1} (from query: "${q}") ---\nError: Search failed for this query.\n\n`;
        }
        
        // Add configurable delay between searches
        if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY));
        }
    }
    
    return aggregatedResult;
}

module.exports = { generateQueries, executeSearch };