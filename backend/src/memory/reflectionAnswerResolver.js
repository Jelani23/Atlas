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

function resolveField(input) {
    if (/\bstructured evidence\b|\banchors?,?\s+comparisons?,?\s+(?:and\s+)?decisions?\b/i.test(input)) {
        return 'evidence';
    }
    if (/\b(?:reflection\s+)?test label\b/i.test(input)) return 'label';
    if (/\b(?:remain(?:ed|s)?|unresolved|open loops?|left to (?:do|verify|validate|finish)|still need)\b/i.test(input)) {
        return 'open_loops';
    }
    if (/\b(?:select(?:ed)?|chose|chosen|decid(?:e|ed)|prefer(?:red)?|decision)\b/i.test(input)) {
        return 'decisions';
    }
    if (/\b(?:compar(?:e|ed|ison)|two (?:approaches|things|options|paths))\b/i.test(input)) {
        return 'comparisons';
    }
    return null;
}

function resolveReflectionAnswer(userInput, relevantMemory) {
    if (!relevantMemory?.reflectionScope?.strict) return null;
    if (!Array.isArray(relevantMemory.reflections) || relevantMemory.reflections.length !== 1) return null;

    const field = resolveField(userInput);
    if (!field) return null;

    const reflection = relevantMemory.reflections[0];
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

    if (field === 'open_loops') {
        const value = joinValues(reflection.open_loops);
        return value || 'No unresolved work was recorded in that conversation.';
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
    cleanAnchorValue
};
