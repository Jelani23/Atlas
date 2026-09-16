// Conservative fast boundary for explicit explanations/negation. This does
// not claim to classify every conversational paraphrase or mixed request.
const { isToolInventoryRequest } = require('./capabilityRequest');
function isNonExecutingToolMention(message) {
    let text = String(message || '').trim().toLowerCase().replace(/’/g, "'")
        .replace(/^(?:(?:please|alice)[,\s]+)+/, '');
    // Strip conversational framing only when it introduces an explanation.
    // "I was wondering if you could rename ..." remains an action request.
    text = text.replace(/^(?:before (?:doing anything|you (?:do|change|run|execute) anything)[,\s]+)(?=(?:(?:can|could|would) you )?(?:explain|describe|tell me|show me|teach me)\b)/, '')
        .replace(/^(?:i (?:was|am) (?:just )?(?:wondering|curious)(?: about)?|i(?:'m| am) (?:just )?(?:curious|trying to (?:understand|learn))|i(?:'d| would) like to (?:know|understand|learn))\s+(?=(?:how|what|why|whether)\b)/, '')
        .replace(/^(?:can|could|would) you (?:please )?(?:tell|show|teach) me\s+(?=(?:how|what|why)\b)/, '');
    if (/^["“][\s\S]*["”][.!?]*$/.test(text)) return true;
    return isToolInventoryRequest(text)
        || /^(?:how to|whether (?:i|we|you) (?:can|should))\b/.test(text)
        || /^(?:(?:can|could|would) you )?(?:explain|describe|teach me|tell me)\s+(?:how|what|why)\b/.test(text)
        || /^(?:(?:can|could|would) you )?walk me through\b/.test(text)
        || /^(?:what (?:else )?can you do|what tools do you have(?: and what are their limitations)?|can you read your own code)[?!.\s]*$/.test(text)
        || /^do you have (?:(?:file|internet|web|network) access|access to (?:the )?(?:web(?: search)?|internet|files?)(?: or only your training knowledge)?)[?!.\s]*$/.test(text)
        || /^(?:do you understand|you understand) (?:the )?(?:current )?(?:state|status) of your (?:tts|stt|voice|speech)(?: right)?[?!.\s]*$/.test(text)
        || /^how (?:do|can|would|should) (?:i|we)\b/.test(text)
        || /^how (?:does|do)\b.+\b(?:work|differ)[?!.\s]*$/.test(text)
        || /^(?:what|which) (?:inputs|arguments|parameters) (?:does|do)\b/.test(text)
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
