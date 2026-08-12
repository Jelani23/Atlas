// backend/src/memory/memoryExtractor.js
const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();

async function extractMemory(message, history = []) {
    const recentHistory = history.slice(-5).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

    const prompt = `
        Conversation History:
        ${recentHistory || 'None'}

        Current User Message: "${message}"

        Analyze the Current User Message and extract distinct, atomic memories using the Canonical Memory Model.
        Use the Conversation History for context if the current message is a follow-up.
        
        Canonical Memory Classes (use ONLY these):
        1. "identity": Stable personal facts (name, birthday, timezone).
        2. "preference": What the user likes/dislikes or how they prefer things done (favorite color, dark mode, working alone).
        3. "behavior": Recurring patterns about how the user acts or works (hyperactivity, time management, social drain).
        4. "relationship": Facts about the User <-> Alice/ATLAS relationship.
        5. "state": Ephemeral current situation (current_project, current_task).
        6. "history": Past durable events or completed milestones.
        7. "project": Software projects, architectures, technologies.
        8. "knowledge": Code snippets, reference material.
        9. "procedure": Operational rules (If X, then Y).

        STRICT SCHEMA RULES:
        - "subject": Who/what does this belong to? (e.g., "user", "atlas", "bindex").
        - "key": The canonical snake_case concept (e.g., "name", "favorite_color", "current_project").
        - "value": The actual information, phrased concisely.

        CRITICAL INSTRUCTIONS:
        - DO NOT create duplicates. If a preference is stated, use the "preference" class. Do not also put it in "behavior".
        - If the user is giving an instruction, a rule, or a guideline, categorize it as "procedure".
        - For procedures: "key" MUST be a natural language trigger, "value" MUST be a descriptive action.
        - DO NOT save questions, temporary tasks, or explanations requested by the user.

        Return ONLY valid JSON in this exact format:
        {
            "memories": [
                {
                    "shouldRemember": true,
                    "category": "preference",
                    "subject": "user",
                    "key": "favorite_color",
                    "value": "blue",
                    "confidence": 0.9
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