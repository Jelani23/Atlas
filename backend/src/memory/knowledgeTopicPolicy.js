// Topics describe the stored claim. Other memories and source URLs are not evidence.
function normalizeTopic(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function tokens(value) {
    return String(value || '').toLowerCase()
        .replace(/([a-z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-z])/g, '$1 $2')
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map(token => token.length > 4 && token.endsWith('s') && !token.endsWith('ss')
            ? token.slice(0, -1) : token);
}

function assessKnowledgeTopics(row, candidates = row?.topics) {
    const claimTokens = new Set(tokens([row?.subject, row?.key, row?.value].filter(Boolean).join(' ')));
    const topics = [...new Set((Array.isArray(candidates) ? candidates : [])
        .filter(topic => typeof topic === 'string').map(normalizeTopic).filter(Boolean))];
    const supported = [];
    const review = [];
    for (const topic of topics) {
        const parts = tokens(topic);
        const missing = parts.filter(part => !claimTokens.has(part));
        if (parts.length && !missing.length) supported.push(topic);
        else review.push({ topic, missing_terms: missing, reason: 'Not fully supported by the stored claim text; review synonyms and scope.' });
    }
    return { supported, review };
}

function groundedKnowledgeTopics(row, candidates = row?.topics) {
    return assessKnowledgeTopics(row, candidates).supported;
}

module.exports = { assessKnowledgeTopics, groundedKnowledgeTopics };
