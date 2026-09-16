// Explicit profile recall gets a broader view than incidental personalization.
// Follow-ups inherit only the immediately preceding user topic, never an
// assistant's unsupported claim that a record does or does not exist.
function directProfileRecall(text) {
    const input = String(text || '').toLowerCase().replace(/[’]/g, "'");
    const aboutSelf = /\b(?:know|remember|recall|stored|saved|recorded)\b[^.!?]*\babout me\b/.test(input)
        || /\bwho am i\b/.test(input)
        || /\b(?:show|list|summarize|review|read)\b[^.!?]*\bmy (?:profile|preferences|favorites|favourites)\b/.test(input);
    const preferenceQuestion = /\b(?:what|which|do you|can you|could you|tell me|remind me)\b/.test(input)
        && (/\bmy (?:favorite\w*|favourite\w*|preferences|profile|birthday|name|timezone|interests)\b/.test(input)
            || /\b(?:what|which) (?:kinds? of )?(?:games?|music|artists?|foods?|drinks?|colou?rs?|anime|animals?|teams?) do i (?:like|love|enjoy|prefer)\b/.test(input));
    const scopedRecall = /\b(?:remember|recall|know|tell me|remind me)\b[^.!?]*\bmy\b[^.!?]*\b(?:preferences|favou?rites?|likes|interests)\b/.test(input);
    if (!aboutSelf && !preferenceQuestion && !scopedRecall) return null;
    const topics = [...new Set(input.match(/\b(?:games?|music|artists?|foods?|drinks?|colou?rs?|anime|animals?|teams?|birthday|name|timezone)\b/g) || [])];
    return { query: input, favorites: /\bfavou?rites?\b/.test(input), topics };
}

function matchesProfileTopic(row, recall) {
    if (!recall?.topics?.length) return true;
    const normalize = word => word.replace(/s$/, '').replace('colour', 'color');
    const words = String(`${row.key || ''} ${row.value || ''}`).toLowerCase().split(/[^a-z0-9]+/).map(normalize);
    return recall.topics.some(topic => words.includes(normalize(topic)));
}

function retrievalQuery(input, history = []) {
    // Ordinary new requests stand alone. Only explicit elliptical follow-ups
    // inherit the previous USER topic; assistant prose is not retrieval evidence.
    if (!/^(?:anything else|what else|tell me more|why|what about that|and then)[?!.\s]*$/i.test(input.trim())) return input;
    const previous = [...history].reverse().find(turn => turn.role === 'user');
    return `${input} ${previous?.content || ''}`;
}

function resolveProfileRecall(text, history = []) {
    const direct = directProfileRecall(text);
    if (direct) return direct;
    const followUp = value => /\b(?:anything else|what else|any others|more of (?:them|those)|tell me more)\b/i.test(value || '')
        || /^(?:which|what|do|are)\b[^.!?]*\b(?:those|these|them|both|same)\b/i.test(value || '');
    if (!followUp(text)) return null;
    const users = history.filter(turn => turn.role === 'user').slice(-4);
    for (let i = users.length - 1; i >= 0; i--) {
        const previous = directProfileRecall(users[i].content);
        if (previous) return { ...previous, followUp: true };
        if (!followUp(users[i].content)) break;
    }
    return null;
}

// Essential profile retrieval is intentionally broad. Presentation can omit
// unrelated preferences on impersonal turns without changing stored records
// or the wider snapshot used for explicit recall.
function selectPersonalContext(rows = [], input = '', history = [], coverage = null) {
    if (coverage || resolveProfileRecall(input, history) || /\b(?:i|my|mine|we|our|ours|us)\b|\b(?:about|for) me\b/i.test(input)) return rows;
    if (/^(?:anything else|what else|tell me more|why|what about that)[?!.\s]*$/i.test(input.trim())) {
        const prior = [...history].reverse().find(turn => turn.role === 'user');
        if (prior) return selectPersonalContext(rows, String(prior.content || ''), [], coverage);
    }
    const words = value => String(value || '').toLowerCase().split(/[^a-z0-9]+/)
        .filter(word => word.length > 2).map(word => word.replace(/s$/, ''));
    const ignored = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'user', 'have', 'like', 'favorite', 'favourite', 'prefer', 'preference', 'not']);
    const requested = new Set(words(input).filter(word => !ignored.has(word)));
    return rows.filter(row => words(`${row.key} ${row.value}`).some(word => !ignored.has(word) && requested.has(word)));
}

module.exports = { resolveProfileRecall, selectPersonalContext, matchesProfileTopic, retrievalQuery };
