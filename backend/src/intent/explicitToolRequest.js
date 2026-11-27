const { normalizeArithmeticExpression } = require('../utils/arithmeticExpression');
// Whole-message grammars only. Never extract commands from discussion or quotes.
function parseExplicitToolRequest(message) {
    const text = String(message).trim().replace(/^(?:(?:okay|ok|alright|well)[, ]+)+/i, '')
        .replace(/^let'?s test(?: out)? (?:some )?other things\.\s*/i, '')
        .replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/i, '');
    const math = text.match(/^(?:calculate|work out(?: what)?|what is|what's)\s+(.+?)(?:\s+is)?(?:\s+for me)?[?.!]*$/i);
    if (math) {
        const expression = normalizeArithmeticExpression(math[1]);
        if (expression && /[+*/-]/.test(expression)) return { toolName: 'calculate', args: [expression] };
    }
    const words = text.match(/^(?:count the words in|word count of|how many words (?:are there )?in)\s+(['"“‘])([\s\S]*)(['"”’])[?.!]*$/i);
    if (words && ({ "'": "'", '"': '"', '“': '”', '‘': '’' })[words[1]] === words[3]
        && !words[2].includes(words[3])) return { toolName: 'wordCount', args: [words[2]] };
    const read = text.match(/^read (?:the code for|the file)\s+([\w./-]+\.[\w]+)(?:\s+lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?)?[.!]?$/i);
    if (read) {
        const args = [read[1]];
        if (read[2]) {
            const start = Number(read[2]), end = Number(read[3] || read[2]);
            if (start < 1 || end < start || end - start >= 200) return null;
            args.push(start, end - start + 1);
        }
        return { toolName: 'readCode', args };
    }
    return null;
}
function parseNumericRequests(message) {
    // Split only outside quotes, and accept only when EVERY clause is a complete
    // pure numerical request. Quoted connectors remain part of the original text.
    const parts = []; let start = 0, quote = null;
    const text = String(message);
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) { if (char === quote) quote = null; continue; }
        if ('"“‘'.includes(char) || (char === "'" && (index === 0 || /\s/.test(text[index - 1])))) {
            quote = ({ '“': '”', '‘': '’' })[char] || char; continue;
        }
        const separator = text.slice(index).match(/^(?:;\s*|,?\s+and\s+(?:(?:also|then)\s+)?)/i);
        if (separator) { parts.push(text.slice(start, index)); index += separator[0].length - 1; start = index + 1; }
    }
    if (quote) return [];
    parts.push(text.slice(start));
    const requests = parts.map(part => parseExplicitToolRequest(part));
    return requests.length <= 8 && requests.every(request => request && ['calculate', 'wordCount'].includes(request.toolName)) ? requests : [];
}
module.exports = { parseExplicitToolRequest, parseNumericRequests };
