// src/tools/writing/extractKeywords.js
async function extractKeywords(text, count = 5) {
    try {
        const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now']);
        
        const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
        const freq = {};
        
        for (const word of words) {
            if (!stopwords.has(word) && word.length > 2) {
                freq[word] = (freq[word] || 0) + 1;
            }
        }
        
        const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, count).map(e => e[0]);
        return `Top ${count} keywords: ${keywords.join(', ')}`;
    } catch (error) {
        return `Error extracting keywords: ${error.message}`;
    }
}

module.exports = {
    execute: extractKeywords,
    intentSchema: {
        name: 'extractKeywords',
        domain: 'TEXT',
        triggers: ['extract keywords', 'keywords for', 'keywords from'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const match = message.match(/(?:extract keywords from|keywords for|extract keywords)\s*:?\s*(.*)/i);
            return [match ? match[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};
