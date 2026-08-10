// src/tools/utilities/wordCount.js
async function wordCount(text) {
    try {
        const words = text.trim().split(/\s+/).length;
        return `Word count: ${words}`;
    } catch (error) {
        return `Error counting words: ${error.message}`;
    }
}

module.exports = {
    execute: wordCount,
    intentSchema: {
        name: 'wordCount',
        domain: 'TEXT',
        triggers: ["word count","how many words"],
        requiredEntities: [],
        extractParams: (message, entities) => {
        const match = message.match(/(?:word count of|how many words in)\s+(.*)/i);
        return [match ? match[1].trim() : null];
    }
    }
};
