const tools = require('../tools');
const { SEARCH_STATUS, isUsableSearchResult } = require('../utils/searchEvidence');
const SEARCH_DELAY = 1000; // Configurable delay (Atlas's suggestion!)

function normalizeSearchRequest(message) {
    const raw = String(message || '').trim();
    const normalized = raw
        .replace(/^(?:please\s+)?(?:search|look up|find)(?:\s+the)?\s+(?:web|internet|online)\s+(?:for\s+)?/i, '')
        .replace(/^(?:please\s+)?(?:search|look up|find)\s+(?:for\s+)?/i, '')
        .replace(/\s+and\s+(?:briefly\s+)?summarize\b[\s\S]*$/i, '')
        .replace(/[.!?]\s*(?:prefer|use|prioritize)\s+(?:official|primary|first-party)(?:\s+sources?)?[\s\S]*$/i, '')
        .replace(/\s+(?:and\s+)?(?:briefly\s+)?(?:summarize|explain|tell me)(?:\s+what)?\s+(?:changed|you find|it)?[.!?]*$/i, '')
        .replace(/^['"]|['"]$/g, '')
        .trim();

    return normalized || raw;
}

// Search-query construction is deliberately deterministic. Generating three
// tiny strings does not require a second LLM pass, and treating a model's
// narration as queries previously added 13 seconds before searching while
// sending nonsense to every provider. Temporal searches include the runtime
// year so "latest" cannot silently collapse back to the model's cutoff era.
async function generateQueries(message) {
    const base = normalizeSearchRequest(message);
    const isTemporal = /\b(latest|current|today|recent|newest|now|this (?:year|month|week)|as of)\b/i.test(base);
    const year = new Date().getFullYear();
    const candidates = isTemporal
        ? [base, `${base} ${year}`, `${base} official`]
        : [base, `${base} official source`, `${base} documentation`];

    return [...new Set(candidates.map(query => query.replace(/\s+/g, ' ').trim()))]
        .filter(Boolean)
        .slice(0, 3);
}

// Executes searches sequentially with rate limiting and per-query error handling (Atlas's suggestion!)
async function executeSearch(queries, { search = tools.webSearch.execute, delayMs = SEARCH_DELAY } = {}) {
    console.log('[SearchPipeline] Queries:', queries);
    // Phase: framing this as raw research material to be read in full and
    // synthesized into ONE answer (see response/controller.js's "search"
    // style), rather than as 3 independent "Result Sets" to summarize
    // one-by-one - that framing was part of why replies came out reading
    // like three shortened summaries stitched together instead of one
    // comprehended answer.
    const sourceBlocks = [];

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
            const res = await search(q);
            if (isUsableSearchResult(res)) {
                sourceBlocks.push(`--- Source material ${i+1} (from query: "${q}") ---\n${res}`);
            }
        } catch (e) {
            console.error(`[SearchPipeline] Failed to execute query ${i+1}: "${q}"`, e.message);
        }
        
        // Add configurable delay between searches
        if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (sourceBlocks.length === 0) {
        return `${SEARCH_STATUS.NO_RESULTS}\nNo verified web evidence was returned by the configured search providers. Do not substitute training-cutoff knowledge or infer that the requested current information does not exist.`;
    }

    return `${SEARCH_STATUS.RESULTS_FOUND}\nRaw research material gathered from multiple related searches follows. Use only this evidence for claims about what is current or latest, cross-reference overlapping/conflicting details, and write one synthesized answer.\n\n${sourceBlocks.join('\n\n')}`;
}

module.exports = { normalizeSearchRequest, generateQueries, executeSearch };
