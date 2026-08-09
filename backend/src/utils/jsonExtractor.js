// Shared JSON extractor for parsing LLM output that may be wrapped in
// reasoning/thinking traces. This used to be copy-pasted with slight (and
// eventually inconsistent) variations across normalizer.js, memoryExtractor.js,
// and index.js - the drift between copies is what let a stray, opener-less
// </think> tag slip through unstripped and dump a full reasoning trace to
// the console. One implementation, used everywhere, so a fix here fixes it
// everywhere.

function extractJSON(text) {
    if (!text) return null;

    // Strip everything up to the LAST </think> tag. This deliberately does not
    // require a matching opening <think> - some providers only send the
    // closing tag, and a text.replace() that only matches paired tags leaves
    // the entire reasoning trace sitting in cleanText, which then gets
    // dumped wholesale into any "failed to parse" debug logging downstream.
    let cleanText = text.replace(/[\s\S]*<\/think>/gi, '');
    // Belt-and-suspenders: strip any remaining stray tags either direction.
    cleanText = cleanText.replace(/<\/?think>/gi, '');

    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
        } catch (e) {
            // fall through to null
        }
    }
    return null;
}

// Strips thinking traces without requiring valid JSON underneath - useful
// for logging/fallback paths where you want a safe, human-readable preview
// of a response without ever letting a raw reasoning trace onto the screen.
function stripThinking(text) {
    if (!text) return '';
    let cleanText = text.replace(/[\s\S]*<\/think>/gi, '');
    return cleanText.replace(/<\/?think>/gi, '').trim();
}

// Safe preview for debug logging: thinking-stripped and length-capped, so a
// "parsing failed" log line can never turn into a multi-thousand-token dump.
function safePreview(text, maxLength = 200) {
    const stripped = stripThinking(text);
    if (stripped.length <= maxLength) return stripped;
    return stripped.slice(0, maxLength) + `... [truncated, ${stripped.length} chars total]`;
}

module.exports = { extractJSON, stripThinking, safePreview };
