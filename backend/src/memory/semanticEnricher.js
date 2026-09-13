const { createMemoryModelAdapter } = require('../models/memoryModelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');

const modelAdapter = createMemoryModelAdapter();

/**
 * Semantic enrichment is intentionally LLM-driven.
 *
 * Deterministic extraction is responsible for recognizing the fact.
 * This module is responsible for understanding what the fact means.
 *
 * DO NOT add semantic alias dictionaries here.
 *
 * Handles both project memories (subject = broad project area) and
 * procedural memories (subject = broad behavioral domain, plus a
 * generalized trigger and a narrower execution context) - project
 * and procedure enrichment share the same LLM plumbing, just with a
 * different prompt shape and a different set of fields written back.
 *
 * IMPORTANT: do not pass a `context` (num_ctx) option to
 * modelAdapter.complete() here. Ollama loads a model at a fixed
 * context size - requesting a different num_ctx on the next call
 * forces a full unload/reload of the model. Overriding it per-call
 * (as an earlier version of this file did, to try to speed things
 * up) instead made enrichment silently fail under load - the reload
 * would time out or error, enrichMemory() would fall back to
 * returning the memory unenriched, and the memory would end up
 * saved with a null subject / empty topics. Let every background
 * call share whatever num_ctx the model is already loaded with.
 *
 * IMPORTANT: every enrichment call passes `format: <schema>` (see
 * PROJECT_ENRICHMENT_SCHEMA / PROCEDURE_ENRICHMENT_SCHEMA below).
 * This is what actually guarantees a parseable response - it
 * constrains Ollama's decoding to the schema at the token level, so
 * the model cannot emit anything else, regardless of prompt wording
 * or how a given model/Ollama build handles `think: false`. Earlier
 * attempts to fix "model reasons in prose instead of returning JSON"
 * by tightening the prompt or raising maxTokens were exactly the
 * kind of fix that has to be re-discovered for every new phrasing
 * that trips it - `format` fixes the whole class of failure at once,
 * for any prompt this file ever sends. Do not remove `format` from a
 * call here in favor of a prompt-only instruction.
 */

const ENRICHABLE_CATEGORIES = ['project', 'procedure'];

const SUBJECT_EXAMPLES = {
    project: [
        'memory', 'database', 'authentication', 'frontend', 'backend',
        'architecture', 'files', 'features', 'integrations', 'deployment',
        'configuration', 'voice', 'models', 'reasoning', 'context',
        'testing', 'logging', 'performance', 'security', 'project_management'
    ],
    procedure: [
        'response_formatting', 'communication', 'coding', 'explanations',
        'research', 'memory', 'reasoning', 'planning', 'interaction',
        'workflow', 'preferences'
    ]
};

const RELATIONSHIP_WORDS = [
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
];

// A deterministic pattern that had no explicit conditional clause in
// the message (e.g. "Always ask before deleting a file") lands here
// as a placeholder trigger. Enrichment should replace it with a real
// generalized condition, not leave it as a literal "in general".
const GENERIC_TRIGGER_PLACEHOLDER = 'in general';

// Ollama's `format` option constrains decoding to a JSON Schema at
// the token level - the model literally cannot emit a token that
// would violate the schema, starting from the very first token of
// the response. This is what actually fixes the "model reasons in
// prose instead of answering" failure mode systemically: `think:
// false` and a `/no_think` prompt hint are both just requests the
// model can (and, on this build, does) ignore, but a schema-
// constrained response can't contain "We are given: ... Steps: 1. "
// - that string can't be the start of anything matching either
// schema below, so decoding is blocked from ever producing it.
const PROJECT_ENRICHMENT_SCHEMA = {
    type: 'object',
    properties: {
        subject: { type: 'string' },
        topics: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5
        }
    },
    required: ['subject', 'topics']
};

const PROCEDURE_ENRICHMENT_SCHEMA = {
    type: 'object',
    properties: {
        subject: { type: 'string' },
        topics: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5
        },
        trigger: { type: 'string' },
        context: { type: 'string' }
    },
    required: ['subject', 'topics', 'trigger', 'context']
};

function buildProjectPrompt(memory) {
    const subjectExamples = SUBJECT_EXAMPLES.project.join('\n    ');

    return `
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
    1. ONE broad subject - the broad project area this belongs to.
    2. 2-5 retrieval topics.

    Examples of subjects:
    ${subjectExamples}

    Topics describe technologies, components, concepts, systems,
    files, behaviors, or implementation concepts explicitly related
    to the memory.

    Do not invent facts.
    Do not use the project name as the subject.
    Do not use relationship words such as:
    ${RELATIONSHIP_WORDS.join(', ')}.

    Return ONLY JSON:

    {
        "subject": "semantic_subject",
        "topics": ["topic_1", "topic_2"]
    }
    `;
}

function buildProcedurePrompt(memory) {
    const subjectExamples = SUBJECT_EXAMPLES.procedure.join('\n    ');

    return `
    Classify the semantic metadata of ONE already-extracted procedural
    memory - a rule for how Alice should behave, reason, format
    responses, or interact with the user.

    This is NOT a reasoning task.
    Do NOT explain your answer.
    Do NOT infer new facts.
    Do NOT rewrite the rule's meaning.

    Input:

    RAW TRIGGER: ${memory.trigger || 'None'}
    ACTION: ${memory.action || 'None'}
    KEY: ${memory.key}
    VALUE: ${memory.value}

    Return FOUR fields:

    1. subject - ONE broad behavioral domain this procedure belongs
       to. Never the user's literal sentence, never a project name
       unless the procedure is explicitly project-specific.

       Examples:
       ${subjectExamples}

    2. topics - 2-5 retrieval terms describing WHEN this procedure is
       relevant, so it can be matched against a future conversation's
       context (e.g. ["step_by_step", "technical_explanations",
       "coding"] or ["beginner_friendly", "code_examples"]). These
       are retrieval metadata only, NOT part of the memory's
       canonical identity - do not use relationship words such as:
       ${RELATIONSHIP_WORDS.join(', ')}.

    3. trigger - a GENERALIZED activation condition, specific enough
       to be useful but broader than the literal wording, e.g.
       "when helping with coding or technical problems" rather than
       a narrow restatement of the raw trigger. If RAW TRIGGER is
       "${GENERIC_TRIGGER_PLACEHOLDER}" or otherwise vague, infer a
       sensible condition from the subject/action/value - do not
       leave it as "${GENERIC_TRIGGER_PLACEHOLDER}".

    4. context - the narrower execution context within the subject
       domain in which this procedure applies, e.g.
       "technical_explanations" or "code_review". Usually one of the
       topics, or closely related to them.

    Do not invent facts not implied by the input. Preserve the actual
    behavioral meaning - only generalize the wording, not the intent.

    Return ONLY JSON:

    {
        "subject": "semantic_subject",
        "topics": ["topic_1", "topic_2"],
        "trigger": "when this procedure applies",
        "context": "narrower_execution_context"
    }
    `;
}

function normalizeTopics(rawTopics) {
    if (!Array.isArray(rawTopics)) {
        return [];
    }

    return rawTopics
        .filter(topic => typeof topic === 'string')
        .map(topic => topic.trim().toLowerCase().replace(/\s+/g, '_'))
        .filter(Boolean)
        .filter(topic => !RELATIONSHIP_WORDS.includes(topic))
        .filter((topic, index, array) => array.indexOf(topic) === index)
        .slice(0, 5);
}

async function callEnrichmentModel(prompt, maxTokens, schema) {
    // Routed through the shared background-memory queue so this
    // never fires concurrently against the same local Ollama
    // instance as another enrichment call or extraction pass - see
    // llmQueue.js. Deliberately no `context` (num_ctx) override here,
    // see the file header comment - a different num_ctx per call
    // forces a model reload.
    //
    // `format: schema` is the actual fix for this call reliably
    // returning JSON (see the schema definitions above for why).
    // `/no_think` and `think: false` are kept as a cheap first-pass
    // nudge - they cost nothing and may get the model to stop
    // "thinking" sooner - but neither is load-bearing anymore, so a
    // future model/Ollama build that ignores them entirely still
    // can't break this.
    return llmQueue.enqueue(() =>
        modelAdapter.complete(
            [
                {
                    role: 'system',
                    content:
                        'You are a lightweight JSON classification API. Output ONLY a single valid JSON object - no explanation, no reasoning, no step-by-step work, nothing before or after it.'
                },
                {
                    role: 'user',
                    content: `${prompt}\n\n/no_think`
                }
            ],
            {
                think: false,
                temperature: 0.1,
                maxTokens,
                format: schema
            }
        )
    );
}

async function enrichProjectMemory(memory) {
    const response = await callEnrichmentModel(
        buildProjectPrompt(memory),
        200,
        PROJECT_ENRICHMENT_SCHEMA
    );
    const parsed = extractJSON(response);

    if (
        !parsed ||
        typeof parsed.subject !== 'string' ||
        !parsed.subject.trim()
    ) {
        console.log(
            '[SemanticEnricher] Invalid project enrichment response:',
            safePreview(response)
        );
        return memory;
    }

    const topics = normalizeTopics(parsed.topics);

    if (topics.length === 0) {
        console.log(
            '[SemanticEnricher] Invalid project enrichment response (no topics):',
            safePreview(response)
        );
        return memory;
    }

    const subject = parsed.subject.trim().toLowerCase().replace(/\s+/g, '_');

    console.log(
        `[SemanticEnricher] LLM enrichment: project/${memory.project_key}/${memory.key} → subject=${subject} topics=${topics.join(', ')}`
    );

    return {
        ...memory,
        subject,
        topics,
        needs_semantic_enrichment: false
    };
}

async function enrichProcedureMemory(memory) {
    const response = await callEnrichmentModel(
        buildProcedurePrompt(memory),
        300,
        PROCEDURE_ENRICHMENT_SCHEMA
    );
    const parsed = extractJSON(response);

    if (
        !parsed ||
        typeof parsed.subject !== 'string' ||
        !parsed.subject.trim() ||
        typeof parsed.trigger !== 'string' ||
        !parsed.trigger.trim() ||
        typeof parsed.context !== 'string' ||
        !parsed.context.trim()
    ) {
        console.log(
            '[SemanticEnricher] Invalid procedure enrichment response:',
            safePreview(response)
        );
        return memory;
    }

    const topics = normalizeTopics(parsed.topics);

    if (topics.length === 0) {
        console.log(
            '[SemanticEnricher] Invalid procedure enrichment response (no topics):',
            safePreview(response)
        );
        return memory;
    }

    const subject = parsed.subject.trim().toLowerCase().replace(/\s+/g, '_');
    const trigger = parsed.trigger.trim();
    const context = parsed.context.trim().toLowerCase().replace(/\s+/g, '_');

    console.log(
        `[SemanticEnricher] LLM enrichment: procedure/${memory.key} → subject=${subject} topics=${topics.join(', ')} trigger="${trigger}" context=${context}`
    );

    return {
        ...memory,
        subject,
        topics,
        trigger,
        context,
        needs_semantic_enrichment: false
    };
}

async function enrichMemory(memory) {

    if (
        !memory ||
        !ENRICHABLE_CATEGORIES.includes(memory.category) ||
        memory.needs_semantic_enrichment !== true
    ) {
        return memory;
    }

    try {

        if (memory.category === 'project') {
            return await enrichProjectMemory(memory);
        }

        return await enrichProcedureMemory(memory);

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
            ENRICHABLE_CATEGORIES.includes(memory.category) &&
            memory.needs_semantic_enrichment === true
    );

    if (targets.length === 0) {
        return memories;
    }

    // Each enrichMemory() call is itself serialized through
    // llmQueue, so this Promise.all no longer means N simultaneous
    // Ollama requests - it just lets all N settle without one
    // slow/failed enrichment blocking the others' bookkeeping.
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
            ENRICHABLE_CATEGORIES.includes(memory.category) &&
            memory.needs_semantic_enrichment === true
        ) {
            return enrichedTargets[targetIndex++];
        }

        return memory;
    });
}

module.exports = {
    enrichMemory,
    enrichMemories,
    PROJECT_ENRICHMENT_SCHEMA,
    PROCEDURE_ENRICHMENT_SCHEMA
};
