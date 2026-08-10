// src/tools/utilities/characterCount.js
async function characterCount(text) {
    try {
        const withSpaces = text.length;
        const withoutSpaces = text.replace(/\s/g, '').length;
        return `Character count (with spaces): ${withSpaces}\nCharacter count (without spaces): ${withoutSpaces}`;
    } catch (error) {
        return `Error counting characters: ${error.message}`;
    }
}

module.exports = {
    execute: characterCount,
    intentSchema: {
        name: 'characterCount',
        domain: 'TEXT',
        triggers: ['character count', 'how many characters', 'characters in'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Strip out "the word" or "the string" so it only counts the target
            const match = message.match(/(?:character count of|how many characters are in|how many characters in|characters in)\s+(?:the word\s+|the string\s+)?(.*)/i);
            return [match ? match[1].replace(/[?.!]+$/, '').trim() : null];
        }
    }
};