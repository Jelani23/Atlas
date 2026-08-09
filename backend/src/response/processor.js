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
    // Remove everything up to the LAST </think> tag - handles a stray
    // closing tag with no matching opener (some providers only emit the
    // closer). The old regex here only matched paired <think>...</think>
    // tags, so an opener-less closer left the entire reasoning trace intact
    // and it could leak straight into the reply shown to the user.
    let cleaned = stripThinking(text);
    
    // Aggressive removal of Qwen3 plain-text reasoning phrases (in case tags fail)
    const reasoningPhrases = [
        /^(First, I need to check.*|Let me think.*|Hmm\.\.\..*|Looking at the.*|Important to remember.*|The response should.*|Final thought:.*|Also noting.*|checks heuristics.*|No need to mention.*|Also important.*|Okay, let me break this down.*|checks recent memory.*|We are given a user.*|Let me check the.*|Critical point:|Okay, the user is asking.*)\n?/gim,
        /^(Step \d+:.*)\n?/gim
    ];
    for (const phrase of reasoningPhrases) {
        cleaned = cleaned.replace(phrase, '');
    }
    
    // If the model outputs "Final response:" or "Response:", take only the text after it
    const finalMatch = cleaned.match(/(?:Final response:|Response:)\s*(.*)/is);
    if (finalMatch) {
        cleaned = finalMatch[1];
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

module.exports = { processResponse };