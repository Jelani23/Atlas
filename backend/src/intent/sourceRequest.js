// Explicit source operations, not occurrences of the word "read" in prose.
function parseSourceRead(message) {
    const input = String(message || '').trim().replace(/\s+/g, ' ');
    const match = input.match(/^(?:please )?(?:(?:can|could|would) you (?:please )?)?(?:read(?: (?:out|me))?(?: the code for| code for| the code| code| the file| file)?|(?:show(?: me)?|open|inspect|look at|send me)(?: (?:the )?code for| (?:the )?file)?)\s+([a-zA-Z0-9_./\\-]+)(?:\s+file)?(?:\s+lines?\s+(\d+)\s*(?:-|through|to)\s*(\d+))?[?!.]?$/i);
    if (!match) return null;
    // A terminal full stop is punctuation, not part of a source filename.
    const filename = match[1].replace(/\.$/, '');
    return match[2] ? [filename, Number(match[2]), Number(match[3]) - Number(match[2]) + 1] : [filename];
}
function parseReadSequence(message) {
    const match = String(message || '').trim().match(/^(.+?)(?:,?\s+then|,?\s+and(?: then)?)\s+((?:read|show)(?: me)? the next (?:page|section))[.!?]?$/i);
    return match ? parseSourceRead(match[1]) : null;
}
function isSourceDiscussion(message) {
    const text = String(message || '').trim();
    // Mixed requests with explicit execution stay with the action planner.
    if (/\b(?:then|and)\s+(?:please\s+)?(?:read|open|run|execute|delete|save|write|search)\b/i.test(text)) return false;
    return /^(?:based on|from|given) (?:that|this|the (?:above|previous)) (?:code|source|file|snippet)[,\s]+(?:what|why|how|explain|describe)\b/i.test(text)
        || /^(?:what happens|what would happen)\s+if\b/i.test(text)
        || /^(?:please\s+)?(?:review|analyze) (?:that|this|the (?:above|previous)) (?:code|source|file|snippet)\b/i.test(text);
}
module.exports = {parseSourceRead, parseReadSequence, isSourceDiscussion};
