// Explicit profile recall gets a broader view than incidental personalization.
// Follow-ups inherit only the immediately preceding user topic, never an
// assistant's unsupported claim that a record does or does not exist.
function directProfileRecall(text) {
    const input = String(text || '').toLowerCase().replace(/[’]/g, "'");
    const aboutSelf = /\b(?:know|remember|recall|stored|saved|recorded)\b[^.!?]*\babout me\b/.test(input)
        || /\bwho am i\b/.test(input)
        || /\b(?:show|list|summarize|review|read)\b[^.!?]*\bmy (?:profile|preferences|favorites|favourites)\b/.test(input);
    const preferenceQuestion = /\b(?:what|which|do you|can you|could you|tell me|remind me)\b/.test(input)
        && /\bmy (?:favorite\w*|favourite\w*|preferences|profile|birthday|name|timezone|interests)\b/.test(input);
    if (!aboutSelf && !preferenceQuestion) return null;
    return { query: input, favorites: /\bfavou?rites?\b/.test(input) };
}

function resolveProfileRecall(text, history = []) {
    const direct = directProfileRecall(text);
    if (direct) return direct;
    if (!/\b(?:anything else|what else|any others|more of (?:them|those)|tell me more)\b/i.test(text || '')) return null;
    const users = history.filter(turn => turn.role === 'user').slice(-4);
    for (let i = users.length - 1; i >= 0; i--) {
        const previous = directProfileRecall(users[i].content);
        if (previous) return { ...previous, followUp: true };
        if (!/\b(?:anything else|what else|any others|more of (?:them|those)|tell me more)\b/i.test(users[i].content || '')) break;
    }
    return null;
}

module.exports = { resolveProfileRecall };
