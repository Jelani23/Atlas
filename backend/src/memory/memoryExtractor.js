// backend/src/memory/memoryExtractor.js
const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();

async function extractMemory(message, workingContext = {}) {
    // Phase 5: Drastically reduced prompt. No raw history.
    // The LLM only needs to resolve ambiguous memory candidates.
    const prompt = `You are a memory classifier. Determine if the user's message contains persistent information worth storing. 
If the message is a question, command, or conversational filler, return empty memories.

Current Context:
- Active Project: ${workingContext.current_project || 'None'}
- Current Topic: ${workingContext.current_topic || 'None'}

User message: "${message}"

Return ONLY valid JSON in this exact format:
{
  "memories": [
    {
      "category": "preference|behavior|identity|relationship|state|history|project|knowledge|procedure",
      "subject": "user|atlas|bindex",
      "key": "snake_case_key",
      "value": "concise_value",
      "confidence": 0.9
    }
  ],
  "conversation_update": {
    "current_topic": "Updated topic if changed",
    "recent_decisions": ["Any decisions made in this message"]
  }
}

If nothing should be remembered, return:
{ "memories": [], "conversation_update": {} }`;

    try {
        const response = await modelAdapter.complete([
            { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { think: false, temperature: 0.1 });

        const parsed = extractJSON(response);
        if (parsed && parsed.memories && Array.isArray(parsed.memories)) {
            return parsed;
        }
        console.log("[MemoryExtractor] Failed to parse memories from response:", safePreview(response));
        return { memories: [], conversation_update: {} };
    } catch (error) {
        console.error("[MemoryExtractor] Memory extraction failed:", error.message);
        return { memories: [], conversation_update: {} };
    }
}

module.exports = { extractMemory };