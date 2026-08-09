async function detectIntent(message) {
    const lowerMsg = message.toLowerCase().trim();

    // --- HYPOTHETETICAL GUARD ---
    if (/^(if|what if|suppose|hypothetically)/.test(lowerMsg)) {
        return { primary: "conversation", secondary: [] };
    }

    // --- MEMORY ---
    if (/\b(remember|procedural rule|keep in mind|add this to|snippet|knowledge)\b/.test(lowerMsg)) {
        return { primary: "memory", secondary: [] };
    }

    // --- ACTION (Tools) ---
    if (/\b(calculate|math|times|plus|minus|divided)\b/.test(lowerMsg) && /\d/.test(lowerMsg)) return { primary: "action", secondary: [] };
    if (/\b(convert|timezone|jst|est|pst|gmt|what time|what date|current time|current date|what day|tell me the time|what year|current year)\b/.test(lowerMsg)) return { primary: "action", secondary: [] };
    
    const hasFileKeyword = /\b(note|file|code|source|src|ideas|future_ideas|\.js|\.json|folder|directory|contents)\b/.test(lowerMsg);
    const hasActionVerb = /\b(write|create|save|read|open|show|list|delete|edit|update|append|add|pull up|inspect|look at|rename|go inside|send me|tell|contents|check|analyze|review|examine|audit|suggest|improve|propose|fix)\b/.test(lowerMsg);
    
    const hasNoteTrigger = /\b(take note|jot down|write down|save this idea|remember this idea|log this)\b/.test(lowerMsg);

    // NEW: If the user explicitly mentions a file extension, treat as action (fixes follow-up responses)
    if (/\.(js|json|txt|md)/i.test(lowerMsg)) return { primary: "action", secondary: [] };

    if (hasFileKeyword && hasActionVerb) return { primary: "action", secondary: [] };
    if (hasActionVerb && (lowerMsg.includes('file') || lowerMsg.includes('folder') || lowerMsg.includes('directory') || lowerMsg.includes('contents'))) return { primary: "action", secondary: [] };
    if (hasNoteTrigger) return { primary: "action", secondary: [] };
    if (/\b(list notes|list code|project structure|full directory|project folder|source files|source code|source folder)\b/.test(lowerMsg)) return { primary: "action", secondary: [] };
    if (/\b(mark|update feature|dev state)\b/.test(lowerMsg)) return { primary: "action", secondary: [] };

    if (lowerMsg.includes('file') && (lowerMsg.includes('your') || lowerMsg.includes('internal') || lowerMsg.includes('atlas'))) return { primary: "action", secondary: [] };

    // --- CODE GENERATION (Must be before Search to catch "build", "write a script", etc.) ---
    if (/\b(build|generate|write a script|write a function|write a code|create a script|algorithm|javascript|regex|html|css)\b/.test(lowerMsg)) {
        return { primary: "action", secondary: [] };
    }

    // --- SEARCH ---
    // FIX: Removed generic "find" to prevent math/coding requests from triggering web search
    if (/\b(look up|search|who is|what is the latest|news on|find out|find a link|find an article|google)\b/.test(lowerMsg)) {
        return { primary: "search", secondary: [] };
    }

    // --- CODING ---
    if (/\b(debug|error|bug|fix this|function|class|database|schema|query|javascript|python|sql|api)\b/.test(lowerMsg)) return { primary: "coding", secondary: [] };

    // --- PLANNING ---
    if (/\b(architecture|roadmap|strategy|design|plan|brainstorm|idea|ideas|structure|organize)\b/.test(lowerMsg)) return { primary: "planning", secondary: [] };

    return { primary: "conversation", secondary: [] };
}

module.exports = { detectIntent };