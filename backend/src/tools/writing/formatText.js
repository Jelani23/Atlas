// src/tools/writing/formatText.js
async function formatText(text, format) {
    try {
        switch(format.toLowerCase()) {
            case 'uppercase': return text.toUpperCase();
            case 'lowercase': return text.toLowerCase();
            case 'titlecase': return text.replace(/\b\w/g, c => c.toUpperCase());
            case 'capitalize': return text.charAt(0).toUpperCase() + text.slice(1);
            case 'trim': return text.trim().replace(/\s+/g, ' ');
            default: return `Error: Unsupported format. Use uppercase, lowercase, titlecase, capitalize, or trim.`;
        }
    } catch (error) {
        return `Error formatting text: ${error.message}`;
    }
}

module.exports = {
    execute: formatText,
    intentSchema: {
        name: 'formatText',
        domain: 'TEXT',
        triggers: ['format text', 'format this', 'format', 'uppercase', 'lowercase', 'titlecase', 'capitalize'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Matches "Format the text hello world to uppercase"
            const m1 = message.match(/(?:format the text|format this|format)\s+(.*?)\s+(?:to|in)\s+(uppercase|lowercase|titlecase|capitalize|trim)/i);
            if (m1) return [m1[1].trim(), m1[2]];
            
            // Matches "Format to uppercase: hello world"
            const m2 = message.match(/(?:format\s+)?(?:to\s+)?(uppercase|lowercase|titlecase|capitalize|trim):\s*(.*)/i);
            if (m2) return [m2[2].trim(), m2[1]];
            
            return [null, null];
        }
    }
};