const { stripThinking } = require('../utils/jsonExtractor');

function processResponse(response, style) {
    let cleaned = response;

    // 1. Remove Qwen thinking traces
    cleaned = removeThinkingTraces(cleaned);

    // 2. Remove Markdown if not allowed
    if (!style.allowMarkdown) {
        cleaned = removeMarkdown(cleaned);
    } 
    else if (!style.allowLists) {
        cleaned = cleaned.replace(/^[-*+]\s+/gm, '');
    }

    // 3. Clean excessive emojis
    cleaned = removeExcessiveEmoji(cleaned);
    
    return cleaned.trim();
}

function removeThinkingTraces(text) {
    // Phase (delimiter fix): check the app-defined "Final response:"
    // delimiter FIRST and unconditionally - see the matching comment in
    // conversationEngine.js's filterThinking() for why this exists (the
    // tag- and marker-based checks below don't catch every narration
    // style the model can produce; an explicit delimiter the model is
    // instructed to always use is a structural fix instead of a guess).
    // This used to run last, as an opportunistic pattern match, AFTER the
    // internal-marker wipe below could already have blanked `cleaned` out
    // to '' - meaning a response that legitimately contained "Final
    // response:" somewhere could still lose its real answer if an
    // internal-marker echo happened to appear earlier in the same text.
    // Checking first and returning immediately avoids that ordering bug
    // entirely.
    const finalMatch = text.match(/final response:\s*([\s\S]*)/i);
    if (finalMatch) {
        return finalMatch[1].trim();
    }

    // Remove everything up to the LAST </think> tag - handles a stray
    // closing tag with no matching opener (some providers only emit the
    // closer). The old regex here only matched paired <think>...</think>
    // tags, so an opener-less closer left the entire reasoning trace intact
    // and it could leak straight into the reply shown to the user.
    let cleaned = stripThinking(text);

    // Phase (untagged-narration fix): stripThinking() only helps when a
    // </think> tag is actually present. This model sometimes reasons with
    // NO tag at all, narrating its own system prompt's internal section
    // labels by name instead (e.g. "In the ALICE MEMORY CONTEXT
    // section..." - see contextBuilder.js for where these literal labels
    // come from). A genuine answer would never contain these strings, so
    // if one shows up, treat everything from the start of the text up to
    // (and including a following sentence, if present) as narration and
    // drop it - same signal used by the live filter in
    // conversationEngine.js, applied here for the non-streaming path and
    // as a final defense-in-depth pass on the streaming path's leftovers.
    const INTERNAL_NARRATION_MARKERS = [
        'ALICE MEMORY CONTEXT', 'ATLAS OS HOT CONTEXT', 'END HOT CONTEXT',
        'ATLAS OS DEVELOPMENT STATE', 'ATLAS OS WORLD MODEL', 'END WORLD MODEL',
        'ATLAS OS OPERATIONAL HEURISTICS', 'END MEMORY CONTEXT'
    ];
    const upperCleaned = cleaned.toUpperCase();
    if (INTERNAL_NARRATION_MARKERS.some(m => upperCleaned.includes(m))) {
        // The whole thing is narration with no reliable boundary marking
        // where a real answer might resume (unlike a proper </think> tag,
        // there's no clean "everything after this point is safe" cut
        // point) - dropping it entirely and letting the existing
        // empty-reply fallback handle it is safer than guessing at a
        // split point and accidentally including more narration.
        cleaned = '';
    }

    // Aggressive removal of Qwen3 plain-text reasoning phrases (in case tags fail)
    const reasoningPhrases = [
        /^(First, I need to check.*|Let me think.*|Hmm\.\.\..*|Looking at the.*|Important to remember.*|The response should.*|Final thought:.*|Also noting.*|checks heuristics.*|No need to mention.*|Also important.*|Okay, let me break this down.*|checks recent memory.*|We are given a user.*|Let me check the.*|Critical point:|Okay, the user is asking.*|Make it conversational.*|Use emojis if appropriate.*|Avoid mentioning.*|Wait, the user.*|So the response should.*|Focus on what's relevant.*)\n?/gim,
        /^(Step \d+:.*)\n?/gim
    ];
    for (const phrase of reasoningPhrases) {
        cleaned = cleaned.replace(phrase, '');
    }
    
    // If the model outputs "Response:" alone (without "Final response:",
    // already handled unconditionally above), take only the text after it
    const bareResponseMatch = cleaned.match(/Response:\s*(.*)/is);
    if (bareResponseMatch) {
        cleaned = bareResponseMatch[1];
    }
    
    // Clean up leading whitespace left over after stripping
    cleaned = cleaned.replace(/^\s+\n/, '');
    
    // Remove excessive empty lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Un-escape HTML entities that registry.js escapes on the way in (so <think>
    // tags embedded in real code/notes don't get mistaken for the model's own
    // reasoning tags). Do this LAST, after think-tag stripping above, so a
    // literal &lt;think&gt; that was actually part of source code survives
    // as readable code instead of getting treated as a reasoning tag.
    cleaned = cleaned.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    
    return cleaned.trim();
}

function removeMarkdown(text) {
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/^>\s+/gm, '')
        .replace(/^---+$/gm, '')
        .replace(/^[-*+]\s+/gm, '');
}

function removeExcessiveEmoji(text) {
    const emojiPatterns = ["🟡", "🧠", "✨", "😊", "🎉", "🚀", "💡", "🤖", "👍", "👀", "🔍"];
    let cleaned = text;
    for (const emoji of emojiPatterns) {
        cleaned = cleaned.replace(new RegExp(emoji, "g"), '');
    }
    cleaned = cleaned.replace(/  +/g, ' ');
    return cleaned;
}

// Exported separately (not just via processResponse) so the streaming
// path in conversationEngine.js can run the exact same thinking-trace
// removal on a small leading buffer of live tokens, instead of only
// getting applied after the whole reply has already been streamed to
// the user. One implementation, used for both the post-hoc full-text
// pass and the real-time leading-edge pass, so they can't drift apart.
module.exports = { processResponse, removeThinkingTraces };