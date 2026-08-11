// backend/src/voice/tts/speechPreprocessor.js

/**
 * Cleans LLM output to make it suitable for Text-to-Speech.
 */
function prepareForTTS(text) {
    if (!text) return '';

    let cleanText = text;

    // 1. Remove Multi-line Code Blocks (``` or single ` spanning multiple lines)
    // This catches both standard triple backticks AND single backtick multi-line blocks
    cleanText = cleanText.replace(/(?:```|`)[\s\S]*?\n[\s\S]*?(?:```|`)/g, ' ... ');
    
    // 2. Remove inline code backticks (e.g., `npm install` -> npm install)
    cleanText = cleanText.replace(/`/g, '');
    
    // 3. Remove Markdown Links: [text](url) -> text
    cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // 4. Remove Markdown Headings (#, ##, etc.)
    cleanText = cleanText.replace(/^#{1,6}\s+/gm, '');
    
    // 5. Remove Markdown Bold/Italic/Strikethrough formatting
    cleanText = cleanText.replace(/\*\*([^*]+)\*\*/g, '$1'); 
    cleanText = cleanText.replace(/\*([^*]+)\*/g, '$1');     
    cleanText = cleanText.replace(/__([^_]+)__/g, '$1');     
    cleanText = cleanText.replace(/_([^_]+)_/g, '$1');       
    cleanText = cleanText.replace(/~~([^~]+)~~/g, '$1'); 
    
    // 6. Remove Markdown Blockquotes (>)
    cleanText = cleanText.replace(/^>\s+/gm, '');
    
    // 7. Remove Markdown List markers (*, -, +, 1.)
    cleanText = cleanText.replace(/^[\*\-\+]\s+/gm, '');
    cleanText = cleanText.replace(/^\d+\.\s+/gm, '');
    
    // 8. Remove Emojis (Comprehensive Unicode range)
    cleanText = cleanText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu, '');
    
    // 9. Normalize excessive whitespace
    cleanText = cleanText.replace(/[ \t]+/g, ' ');
    cleanText = cleanText.replace(/\n{3,}/g, '\n\n');
    
    cleanText = cleanText.trim();
    
    // 10. Ensure punctuation at the end to prevent TTS hallucinating "a" or "an" on single words
    if (cleanText && !/[.!?]$/.test(cleanText)) {
        cleanText += '.';
    }
    
    return cleanText;
}

module.exports = { prepareForTTS };