// Conservative vetoes, not a semantic classifier. A veto means "do not merge",
// not "these claims are false". False negatives can be reviewed without data loss.
function quantityAnchors(value) {
    return [...new Set((String(value || '').match(/[+-]?\d+(?:\.\d+)*(?:\s*[\p{L}%]+)?/gu) || [])
        .map(token => token.replace(/\s+/g, '')))].sort();
}

function polarityMarkers(value) {
    return (String(value || '').toLowerCase().match(/\b(?:not|no|never|without|cannot)\b|n't\b/g) || []).length;
}

function procedureScopeDiffers(memory, candidate) {
    return memory.category === 'procedure' && ['trigger', 'action'].some(field =>
        String(memory[field] || '').trim() !== String(candidate[field] || '').trim()
    );
}

function equivalenceRisk(memory, candidate) {
    if (procedureScopeDiffers(memory, candidate)) return 'Procedure trigger/action differences require review before merging.';

    if (JSON.stringify(quantityAnchors(memory.value)) !== JSON.stringify(quantityAnchors(candidate.value))) {
        return 'Different numeric or unit anchors require review before merging.';
    }
    if (polarityMarkers(memory.value) !== polarityMarkers(candidate.value)) {
        return 'Different polarity markers require review before merging.';
    }
    if (/\bonly\b/i.test(memory.value) !== /\bonly\b/i.test(candidate.value)) {
        return 'Different restriction markers require review before merging.';
    }
    return null;
}

module.exports = { equivalenceRisk, quantityAnchors, procedureScopeDiffers };
