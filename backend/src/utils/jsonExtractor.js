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

    const lastBrace = cleanText.lastIndexOf('}');
    if (lastBrace === -1) return null;

    // Try every '{' at or before lastBrace, starting from the one
    // closest to the end and working backward. Some local models
    // (observed with qwen3 even when asked not to reason) emit plain
    // reasoning prose with no <think> tags at all before the actual
    // JSON - naively pairing the FIRST '{' in the whole response with
    // the last '}' grabs a corrupted, unbalanced span if that prose
    // happens to mention a brace character anywhere. Preferring the
    // opening brace closest to the end first makes this robust to
    // that without needing a full JSON tokenizer.
    let searchFrom = lastBrace;
    while (true) {
        const openBrace = cleanText.lastIndexOf('{', searchFrom);
        if (openBrace === -1) break;

        try {
            return JSON.parse(cleanText.substring(openBrace, lastBrace + 1));
        } catch (e) {
            // Try the next '{' further back in the text.
        }

        searchFrom = openBrace - 1;
        if (searchFrom < 0) break;
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

// Signals observed in Qwen's untagged content-channel self-narration. These
// are intentionally about the model discussing the user, prompt, response,
// or its own answer construction—not generic transition words that commonly
// belong in a legitimate answer.
const REASONING_PROSE_PATTERNS = [
    /\bokay,\s+the user\b/i,
    /\bthe user (?:is asking|asked|said|wants|requested)\b/i,
    /\bhmm\b/i,
    /\bfirst,\s+i need\b/i,
    /^\s*let me\b/i,
    /\bi need to (?:respond|answer|recall|check|follow|make sure)\b/i,
    /\bas (?:atlas|alice),?\s+i\b/i,
    /\b(?:the )?(?:final )?(?:answer|response) should\b/i,
    /\bfinal response (?:will|should|must|is)\b/i,
    /\bwe are given (?:a|the)\b/i,
    /\blooking at (?:the|my)\b/i,
    /\bwait,\s*(?:the user|no|but)\b/i
];

function reasoningProseDensity(text) {
    const value = String(text || '');
    return REASONING_PROSE_PATTERNS.reduce(
        (count, pattern) => count + (pattern.test(value) ? 1 : 0),
        0
    );
}

function looksLikeReasoningProse(text) {
    return reasoningProseDensity(text) > 0;
}

// Safe preview for debug logging: thinking-stripped and length-capped, so a
// "parsing failed" log line can never turn into a multi-thousand-token dump.
function safePreview(text, maxLength = 200) {
    const stripped = stripThinking(text);
    if (stripped.length <= maxLength) return stripped;
    return stripped.slice(0, maxLength) + `... [truncated, ${stripped.length} chars total]`;
}

module.exports = {
    extractJSON,
    stripThinking,
    safePreview,
    looksLikeReasoningProse,
    reasoningProseDensity
};
