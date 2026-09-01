// backend/src/utils/keywordExtractor.js
//
// Deterministic keyword extraction, factored out of contextManager.js so
// it has one implementation shared by both the retrieval-scoring path
// (contextManager.js) and chat-log tagging (conversationEngine.js/
// workingMemory.js). Kept intentionally simple/deterministic per plan
// rule 4 - this is a stopword-filtered token set, not an LLM call.

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'in',
    'on', 'for', 'with', 'about', 'can', 'you', 'me', 'my', 'i', 'it',
    'this', 'that'
]);

function extractKeywords(text) {
    if (!text) return new Set();
    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    );
}

module.exports = { extractKeywords, STOP_WORDS };
