const { createModelAdapter } = require('../models/modelAdapter');
const tools = require('../tools/registry');
const { stripThinking } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();
const SEARCH_DELAY = 1000; // Configurable delay (Atlas's suggestion!)

// Generates 3 distinct search queries using line-by-line generation
async function generateQueries(message) {
    const prompt = `
        User Request: "${message}"
        Generate 3 distinct, concise search engine queries to find information about this request. Include different perspectives (e.g., the core subject, specific platforms, related terms).
        Output ONE query per line. Do not number them. Do not output any other text.
    `;
    
    try {
        const response = await modelAdapter.complete([
            { role: 'system', content: 'You are a search query generator.' },
            { role: 'user', content: prompt }
        ], { think: true, temperature: 0.3 });
        
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
    let aggregatedResult = "Aggregated Web Search Results:\n\n";
    
    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        try {
            console.log(`[SearchPipeline] Executing query ${i+1}: "${q}"`);
            const res = await tools.webSearch(q);
            aggregatedResult += `--- Result Set ${i+1} (Query: "${q}") ---\n${res}\n\n`;
        } catch (e) {
            console.error(`[SearchPipeline] Failed to execute query ${i+1}: "${q}"`, e.message);
            aggregatedResult += `--- Result Set ${i+1} (Query: "${q}") ---\nError: Search failed for this query.\n\n`;
        }
        
        // Add configurable delay between searches
        if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY));
        }
    }
    
    return aggregatedResult;
}

module.exports = { generateQueries, executeSearch };