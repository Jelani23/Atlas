const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();

async function extractMemory(message, history = []) {
    // OPTIMIZATION: Reduced from 10 to 5 to drastically cut LLM processing time
    const recentHistory = history.slice(-5).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

    const prompt = `
        Conversation History:
        ${recentHistory || 'None'}

        Current User Message: "${message}"

        Analyze the Current User Message and extract distinct, atomic memories.
        Break down compound sentences into individual facts. 
        Use the Conversation History for context if the current message is a follow-up.
        
        Allowed memory categories:
        "user": Personal facts (birthday, hardware, location).
        "relationship": Observations about the user's interests, evolving goals, learning style, or interaction preferences.
        "project": Software projects, architectures, technologies.
        "behavior": How the user prefers Atlas to respond (formatting, tone).
        "knowledge": Code snippets, reference material.
        "procedure": Operational rules (If X, then Y).

        CRITICAL INSTRUCTIONS FOR PROCEDURES:
        If the user is giving an instruction, a rule, or a guideline, categorize it as "procedure".
        For procedures: 
        - "key" MUST be a conceptual, natural language trigger. 
        - "value" MUST be a descriptive action. 
        - "subject" MUST be the operational context. 

        CRITICAL: If the user mentions they are "getting into", "exploring", "interested in", or "working on" a topic, categorize it as a "relationship" observation.

        Do NOT save: questions, temporary tasks, or explanations requested by the user.

        Return ONLY valid JSON in this exact format:
        {
            "memories": [
                {
                    "shouldRemember": true,
                    "category": "user",
                    "key": "short_descriptive_key",
                    "value": "the_specific_value",
                    "subject": "project_name_or_topic_if_applicable_else_null",
                    "confidence": 0.9,
                    "source": "explicit"
                }
            ]
        }

        If nothing should be remembered, return:
        { "memories": [] }
    `;

    try {
        const response = await modelAdapter.complete([
            { role: 'system', content: 'You are a JSON API. Output only valid JSON.' },
            { role: 'user', content: prompt }
        ], { think: false, temperature: 0.1 });

        const parsed = extractJSON(response);
        if (parsed && parsed.memories && Array.isArray(parsed.memories)) {
            return parsed.memories;
        }
        console.log("[MemoryExtractor] Failed to parse memories from response:", safePreview(response));
        return [];
    } catch (error) {
        console.error("[MemoryExtractor] Memory extraction failed:", error.message);
        return [];
    }
}

module.exports = { extractMemory };