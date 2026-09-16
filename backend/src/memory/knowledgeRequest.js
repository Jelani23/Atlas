// Recognize complete factual overview/recall requests, independently of the
// active project. This is a conservative boundary, not a general intent model.
function getKnowledgeOverviewTopic(input) {
    let text = String(input || '').trim().replace(/’/g, "'")
        .replace(/^(?:(?:please|alice)[,\s]+)+/i, '').replace(/[?!.]+$/, '').trim()
        .replace(/[,\s]+please$/i, '').trim();
    text = text.replace(/^(?:(?:can|could|would) you )?tell me who (.+) is$/i, 'Who is $1');
    const match = text.match(/^(?:(?:what(?: all)? (?:do you|can you) (?:know|remember)(?: about)?|(?:can|could|would) you tell me (?:what you (?:know|remember) about|about)|tell me (?:what you (?:know|remember) about|about)|who is|who's)\s+)(.+)$/i);
    if (!match) return null;
    const topic = match[1].trim();
    // Leave personal recall, persona, operating-guide explanations, creative
    // requests and compound actions to their existing owners.
    if (/\b(?:me|my|our|we|you|your|yourself|myself|alice|atlas|preferences?|memories|tools?|joke|story|imagine|pretend|guess|speculate)\b/i.test(topic)) return null;
    if (/[?;\n]|\b(?:and then|also|please|could you|can you|without|don't|do not)\b/i.test(topic)) return null;
    return topic.length <= 160 ? topic : null;
}

module.exports = { getKnowledgeOverviewTopic };
