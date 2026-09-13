// Conservative fast boundary for explicit explanations/negation. This does
// not claim to classify every conversational paraphrase or mixed request.
function isNonExecutingToolMention(message) {
    const text = String(message || '').trim().toLowerCase().replace(/’/g, "'")
        .replace(/^(?:(?:please|alice)[,\s]+)+/, '');
    return /^(?:(?:can|could|would) you )?(?:explain|describe|teach me|tell me)\s+(?:how|what|why)\b/.test(text)
        || /^how (?:do|can|would|should) (?:i|we)\b/.test(text)
        || /^what (?:does|do)\b.+\bmean\b/.test(text)
        || /^(?:(?:can|could|would) you (?:please )?not|do not|don't|never)\s+(?:delete|remove|rename|write|save|append|read|open|search|calculate|convert|run|execute|count)\b/.test(text)
        || /^i(?:'m| am) not asking (?:you )?to\b/.test(text)
        || /^i (?:don't|do not) want you to\b/.test(text)
        || /^(?:we|i) (?:discussed|talked about|mentioned)\b/.test(text);
}

function confirmationDecision(message) {
    const text = String(message || '').trim().toLowerCase().replace(/’/g, "'")
        .replace(/^please[,\s]+/, '');
    // A denial cannot become approval because the sentence also contains yes.
    if (/^(?:no\b|nope\b|cancel\b|stop\b|deny\b|block\b|don't\b|do not\b)/.test(text)) return false;
    if (/^(?:yes|yeah|yep|sure)[,\s]+(?:but\s+)?(?:no\b|don't\b|do not\b|cancel\b|stop\b)/.test(text)) return false;
    if (/^(?:(?:can|could|would) you (?:please )?not|i (?:don't|do not) want you to)\s+(?:delete|remove|rename|write|save|append|read|open|search|calculate|convert|run|execute|count)\b/.test(text)) return false;
    if (/^(?:yes|yeah|yep|sure|do it|please do|go ahead|approve|allow|can you do so|check it|check for that)(?:[\s,!]+(?:please|thanks|thank you|do it|go ahead))*[.!?]*$/.test(text)) return true;
    return null;
}

module.exports = { isNonExecutingToolMention, confirmationDecision };
