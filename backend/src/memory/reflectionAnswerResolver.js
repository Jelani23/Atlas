function cleanAnchorValue(anchor, type) {
    const pattern = new RegExp(`^${type}\\s*:\\s*`, 'i');
    return String(anchor || '').replace(pattern, '').trim();
}

function joinValues(values) {
    const cleaned = (values || []).map(value => String(value || '').trim()).filter(Boolean);
    if (cleaned.length <= 1) return cleaned[0] || '';
    if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
    return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned.at(-1)}`;
}

function attributeUserValues(values) {
    const cleaned = (values || []).map(value => String(value || '').trim()).filter(Boolean);
    if (cleaned.length === 0) return '';
    const quoted = cleaned.map(value => `“${value}”`);
    if (quoted.length === 1) return `You said: ${quoted[0]}.`;
    if (quoted.length === 2) return `You said: ${quoted[0]} and ${quoted[1]}.`;
    return `You said: ${quoted.slice(0, -1).join('; ')}; and ${quoted.at(-1)}.`;
}

function resolveField(input) {
    if (/\bstructured evidence\b|\banchors?,?\s+comparisons?,?\s+(?:and\s+)?decisions?\b/i.test(input)) {
        return 'evidence';
    }
    if (/\b(?:reflection\s+)?test label\b/i.test(input)) return 'label';
    if (/\b(?:chat|conversation|session)\s+(?:title|name)\b|\bwhat (?:was|is) (?:that|the) (?:chat|conversation|session) called\b/i.test(input)) {
        return 'session_title';
    }
    if (/\b(?:remain(?:ed|s)?|unresolved|open loops?|left to (?:do|verify|validate|finish)|still need)\b/i.test(input)) {
        return 'open_loops';
    }
    if (/\b(?:select(?:ed)?|chose|chosen|decid(?:e|ed)|prefer(?:red)?|decision)\b/i.test(input)) {
        return 'decisions';
    }
    if (/\b(?:my (?:main )?concerns?|i (?:want(?:ed)?|prioriti[sz](?:e|ed)|explicitly (?:say|said)|say|said|mention(?:ed)?|required)|time-sensitive|constraint|shouldn['’]?t|mustn['’]?t)\b/i.test(input)) {
        return 'user_positions';
    }
    if (/\b(?:compar(?:e|ed|ison)|two (?:approaches|things|options|paths))\b/i.test(input)) {
        return 'comparisons';
    }
    if (/\b(?:what (?:was|were) discussed|what did we (?:discuss|talk about)|what (?:was|is) (?:that|the) (?:chat|conversation|session) about)\b/i.test(input)) {
        return 'summary';
    }
    return null;
}

function relevantValues(values, input) {
    const rows = (values || []).map(value => String(value || '').trim()).filter(Boolean);
    const normalizedInput = String(input || '').toLowerCase();
    if (/\b(?:not|shouldn['’]?t|mustn['’]?t)\b/.test(normalizedInput)) {
        const negative = rows.filter(value => /\b(?:not|shouldn['’]?t|mustn['’]?t)\b/i.test(value));
        if (negative.length > 0) return negative;
    }
    if (/\b(?:priority|prioriti[sz]|want(?:ed)?)\b/.test(normalizedInput)) {
        const priorities = rows.filter(value => /\b(?:priority|prioriti[sz]|want(?:ed)?)\b/i.test(value));
        if (priorities.length > 0) return priorities;
    }

    const keywords = normalizedInput
        .match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
    const ignored = new Set([
        'what', 'which', 'when', 'where', 'were', 'was', 'did', 'does', 'have',
        'about', 'explicitly', 'main', 'want', 'wanted', 'said', 'say', 'mention',
        'mentioned', 'prioritize', 'prioritized', 'first', 'information', 'why',
        'yet', 'user'
    ]);
    const useful = keywords.filter(keyword => !ignored.has(keyword));
    if (useful.length === 0) return rows;

    const scored = rows.map((value, index) => ({
        value,
        index,
        score: useful.reduce(
            (total, keyword) => total + (value.toLowerCase().includes(keyword) ? 1 : 0),
            0
        )
    }));
    const best = Math.max(...scored.map(row => row.score), 0);
    return best > 0
        ? scored.filter(row => row.score === best).sort((a, b) => a.index - b.index).map(row => row.value)
        : rows;
}

function resolveReflectionAnswer(userInput, relevantMemory) {
    if (!relevantMemory?.reflectionScope?.strict) return null;
    if (!Array.isArray(relevantMemory.reflections) || relevantMemory.reflections.length !== 1) {
        if (relevantMemory.reflectionScope.reason === 'title_ambiguous') {
            const titles = joinValues(relevantMemory.reflectionScope.ambiguousTitles);
            return `I found more than one conversation matching that title: ${titles}. Please use the exact title.`;
        }
        if (relevantMemory.reflectionScope.reason === 'title_missing') {
            return 'I could not find a completed conversation matching that title.';
        }
        if (relevantMemory.reflectionScope.reason === 'title') {
            return `I found the conversation titled "${relevantMemory.reflectionScope.title}", but its reflection is not available yet.`;
        }
        return null;
    }

    const field = resolveField(userInput);
    if (!field) return null;

    const reflection = relevantMemory.reflections[0];
    if (field === 'session_title') {
        return reflection.session_title || relevantMemory.reflectionScope.title ||
            'No title was recorded for that conversation.';
    }
    if (field === 'label') {
        const label = (reflection.anchors || [])
            .find(anchor => /^test_label\s*:/i.test(String(anchor || '')));
        return label
            ? cleanAnchorValue(label, 'test_label')
            : 'No reflection test label was recorded in that conversation.';
    }

    if (field === 'comparisons') {
        const value = joinValues(reflection.comparisons);
        return value || 'No comparison was recorded in that conversation.';
    }

    if (field === 'decisions') {
        const value = joinValues(reflection.decisions);
        return value || 'No decision was recorded in that conversation.';
    }

    if (field === 'user_positions') {
        const values = /\bmy\s+(?:main\s+)?concerns?\b/i.test(userInput)
            ? reflection.decisions
            : relevantValues(reflection.decisions, userInput);
        const value = attributeUserValues(values);
        return value || 'The reflection does not record a matching user-stated position.';
    }

    if (field === 'open_loops') {
        const value = joinValues(reflection.open_loops);
        return value || 'No unresolved work was recorded in that conversation.';
    }

    if (field === 'summary') {
        return String(reflection.summary || '').trim() ||
            'No discussion summary was recorded for that conversation.';
    }

    const anchors = joinValues(reflection.anchors);
    const comparisons = joinValues(reflection.comparisons);
    const decisions = joinValues(reflection.decisions);
    const openLoops = joinValues(reflection.open_loops);
    return [
        `Anchors: ${anchors || 'none'}`,
        `Comparisons: ${comparisons || 'none'}`,
        `Decisions: ${decisions || 'none'}`,
        `Open loops: ${openLoops || 'none'}`
    ].join('\n');
}

module.exports = {
    resolveReflectionAnswer,
    resolveField,
    joinValues,
    attributeUserValues,
    cleanAnchorValue,
    relevantValues
};
