const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();

/**
 * Semantic enrichment is intentionally LLM-driven.
 *
 * Deterministic extraction is responsible for recognizing the fact.
 * This module is responsible for understanding what the fact means.
 *
 * DO NOT add semantic alias dictionaries here.
 */

async function enrichMemory(memory) {

    if (
        !memory ||
        memory.category !== 'project' ||
        memory.needs_semantic_enrichment !== true
    ) {
        return memory;
    }

    const prompt = `
    Classify the semantic metadata of ONE already-extracted project memory.

    This is NOT a reasoning task.
    Do NOT explain your answer.
    Do NOT infer new facts.
    Do NOT rewrite the memory.

    Input:

    PROJECT: ${memory.project_key}
    KEY: ${memory.key}
    VALUE: ${memory.value}
    SEMANTIC HINT: ${memory.semantic_hint || 'None'}

    Return:
    1. ONE broad subject.
    2. 2-5 retrieval topics.

    The subject describes the broad project area.

    Examples:
    memory
    database
    authentication
    frontend
    backend
    architecture
    files
    features
    integrations
    deployment
    configuration
    voice
    models
    reasoning
    context
    testing
    logging
    performance
    security
    project_management

    Topics describe technologies, components, concepts, systems,
    files, behaviors, or implementation concepts explicitly related
    to the memory.

    Do not invent facts.
    Do not use the project name as the subject.
    Do not use relationship words such as:
    uses, requires, supports, includes, contains, depends_on,
    connects_to, connects_with, because, because_of.

    Return ONLY JSON:

    {
        "subject": "semantic_subject",
        "topics": ["topic_1", "topic_2"]
    }
    `;

    try {

        const response = await modelAdapter.complete(
            [
                {
                    role: 'system',
                    content:
                        'You are a lightweight JSON classification API. Output only valid JSON. Do not reason unnecessarily.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            {
                think: false,
                temperature: 0.1
            }
        );

        const parsed = extractJSON(response);

        if (
            !parsed ||
            typeof parsed.subject !== 'string' ||
            !parsed.subject.trim() ||
            !Array.isArray(parsed.topics)
        ) {
            console.log(
                '[SemanticEnricher] Invalid enrichment response:',
                safePreview(response)
            );

            return memory;
        }

        const subject = parsed.subject
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');

        const topics = parsed.topics
            .filter(topic =>
                typeof topic === 'string'
            )
            .map(topic =>
                topic
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, '_')
            )
            .filter(Boolean)
            .filter(topic =>
                ![
                    'uses',
                    'requires',
                    'supports',
                    'includes',
                    'contains',
                    'depends_on',
                    'connects_to',
                    'connects_with',
                    'because',
                    'because_of'
                ].includes(topic)
            )
            .filter(
                (topic, index, array) =>
                    array.indexOf(topic) === index
            )
            .slice(0, 5);

        if (topics.length === 0) {
            console.log(
                '[SemanticEnricher] Invalid enrichment response:',
                safePreview(response)
            );

            return memory;
        }

        console.log(
            `[SemanticEnricher] LLM enrichment: ${memory.project_key}/${memory.key} → subject=${subject} topics=${topics.join(', ')}`
        );

        return {
            ...memory,
            subject,
            topics,
            needs_semantic_enrichment: false
        };

    } catch (error) {

        console.error(
            '[SemanticEnricher] Failed:',
            error.message
        );

        return memory;
    }
}

async function enrichMemories(memories) {

    if (!Array.isArray(memories)) {
        return memories;
    }

    const targets = memories.filter(
        memory =>
            memory &&
            memory.category === 'project' &&
            memory.needs_semantic_enrichment === true
    );

    if (targets.length === 0) {
        return memories;
    }

    const enrichedTargets =
        await Promise.all(
            targets.map(memory =>
                enrichMemory(memory)
            )
        );

    let targetIndex = 0;

    return memories.map(memory => {

        if (
            memory &&
            memory.category === 'project' &&
            memory.needs_semantic_enrichment === true
        ) {
            return enrichedTargets[targetIndex++];
        }

        return memory;
    });
}

module.exports = {
    enrichMemory,
    enrichMemories
};