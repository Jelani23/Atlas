// backend/src/memory/memoryManager.js
const longTermProfile = require('./longTermProfile');
const projectMemory = require('./projectMemory');
const knowledgeLibrary = require('./knowledgeLibrary');
const proceduralMemory = require('./proceduralMemory');
const memoryCache = require('../core/memoryCache');

async function handleMemoryAction(extractedMemories) {
    if (!Array.isArray(extractedMemories)) {
        extractedMemories = [extractedMemories];
    }

    if (extractedMemories.length === 0) {
        return { action: "none", message: "Nothing to remember." };
    }

    const savedMemories = [];

    for (const memory of extractedMemories) {
        if (!memory.shouldRemember) continue;

        try {
            if (memory.category === 'project') {
                await projectMemory.update({ subject: memory.subject || 'general', key: memory.key, value: memory.value });
                memoryCache.invalidate('project_memory');
                savedMemories.push(memory);
            } 
            // Phase 3B.4: Added new canonical classes to route to user_profile
            else if (['identity', 'preference', 'behavior', 'relationship', 'state', 'history', 'user'].includes(memory.category)) {
                await longTermProfile.update({ 
                    category: memory.category, 
                    key: memory.key, 
                    value: memory.value, 
                    confidence: memory.confidence || 1.0 
                });
                memoryCache.invalidate('user_profile');
                savedMemories.push(memory);
            } 
            else if (memory.category === 'knowledge') {
                await knowledgeLibrary.addKnowledge({ subject: memory.subject || 'general', key: memory.key, value: memory.value });
                memoryCache.invalidate('knowledge_library');
                savedMemories.push(memory);
            } 
            else if (memory.category === 'procedure') {
                await proceduralMemory.addProcedure({ trigger: memory.key, action: memory.value, context: memory.subject || 'general' });
                memoryCache.invalidate('procedural_memory');
                savedMemories.push(memory);
            }
        } catch (error) {
            console.error("Failed to save individual memory:", error);
        }
    }

    if (savedMemories.length > 0) {
        return { action: "saved", memories: savedMemories };
    } else {
        return { action: "ignored", memories: extractedMemories };
    }
}

module.exports = { handleMemoryAction };