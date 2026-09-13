const { createMemoryModelAdapter } = require('../models/memoryModelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const projectRegistry = require('./projectRegistry');
const llmQueue = require('./llmQueue');
const { projectExtractionScope } = require('./projectExtractionScope');

const modelAdapter = createMemoryModelAdapter();

// Ollama's `format` option constrains decoding to a JSON Schema at
// the token level - the model cannot emit a token that would violate
// the schema, from the very first token of the response onward. This
// is the systemic fix for this call reliably returning JSON instead
// of reasoning-in-prose: `think: false` and the `/no_think` prompt
// hint below are both just requests the model can (and, on some
// builds, does) ignore, but schema-constrained decoding can't
// produce "We are given: ... Steps: 1. " - that string can't be the
// start of anything matching this schema, so it's structurally
// blocked rather than merely discouraged. This is deliberately loose
// (no `required` beyond category/key/value, no `additionalProperties:
// false`) because which fields are meaningful depends on category -
// a project memory has no trigger/action, a procedure has no
// project_key - and that business rule is enforced separately in the
// parsing code below and in memoryManager's validation. The schema's
// job is only to guarantee valid, well-typed JSON comes back at all.
//
// Phase: `project_key` used to be entirely absent from this schema, so
// the model had no schema-enforced way to return one - memoryManager.js
// then fell back to `memory.subject` to resolve the project, but the
// prompt below explicitly instructs the model that `subject` is a
// domain area ("memory", "database", ...) and is "Never the project
// name". That fallback was therefore looking up a generic domain word
// (or, worse, a plural like "projects"/"memories" when the model
// hedged) in the project registry, failing to match, and silently
// rejecting an otherwise-correct extraction. `project_key` is now a
// first-class schema field, constrained to an enum of the actual
// registered project_key values when any are known - so decoding
// literally cannot produce a project_key that isn't a real project.
function buildExtractionSchema(projectKeys = []) {
    const projectKeyField = projectKeys.length > 0
        ? { type: 'string', enum: projectKeys }
        : { type: 'string' };

    const schema = {
        type: 'object',
        properties: {
            memories: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            enum: ['preference', 'behavior', 'identity', 'relationship', 'state', 'history',
                                'knowledge', 'procedure', ...(projectKeys.length ? ['project'] : [])]
                        },
                        subject: { type: 'string', description: 'The entity that owns the property, not the property itself. Preserve the named entity from the message.' },
                        // project_key: the canonical project identity for
                        // category:'project' memories ONLY. Must be one of
                        // the registered project_key values, never a
                        // display name, alias, or domain word. Omit
                        // entirely for every other category.
                        project_key: projectKeyField,
                        // Phase: minItems added - same root cause as
                        // searchKnowledgeExtractor.js's identical schema. Left
                        // out of `required` deliberately (see the comment above
                        // this schema on why it's loose) since not every category
                        // stored via longTermProfile actually persists topics -
                        // but the model was observed reliably emitting the field
                        // anyway, just empty, so minItems alone is enough to stop
                        // that without over-constraining categories that don't
                        // use it.
                        topics: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
                        key: { type: 'string' },
                        value: { type: 'string' },
                        trigger: { type: 'string' },
                        action: { type: 'string' },
                        context: { type: 'string' },
                        confidence: { type: 'number' },
                        knowledge_category: { type: 'string' },
                        type: { type: 'string' },
                        source: { type: 'string' },
                        source_type: { type: 'string' }
                    },
                    required: ['category', 'key', 'value'],
                    anyOf: [
                        { properties: { category: { enum: ['preference', 'behavior', 'identity', 'relationship', 'state', 'history', 'procedure'] } }, required: ['category', 'key', 'value'] },
                        { properties: { category: { const: 'knowledge' } }, required: ['category', 'key', 'value', 'subject', 'knowledge_category'] },
                        ...(projectKeys.length ? [{ properties: { category: { const: 'project' } }, required: ['category', 'key', 'value', 'project_key'] }] : [])
                    ]
                }
            },
            conversation_update: {
                type: 'object',
                properties: {
                    current_topic: { type: 'string' },
                    recent_decisions: { type: 'array', items: { type: 'string' } }
                }
            }
        },
        required: ['memories']
    };
    // Some constrained decoders do not merge sibling properties into anyOf.
    // Give every alternative its complete fields and required set.
    const item = schema.properties.memories.items;
    item.anyOf = item.anyOf.map(branch => ({
        type: 'object', properties: { ...item.properties, ...branch.properties }, required: branch.required
    }));
    return schema;
}

// Kept for any external code/tests that import the schema shape directly.
// Reflects the no-registered-projects case (project_key unconstrained) -
// extractMemory() always builds the properly-enum-constrained version
// per-call, since the valid set of project keys can change at runtime.
const EXTRACTION_SCHEMA = buildExtractionSchema([]);

// Same deterministic-defaulting rationale as the `type`/`source_type`
// defaulting below - a code-level fallback in case a model still
// returns empty topics despite the schema's minItems, so a knowledge
// memory never actually reaches storage with topics: [].
function deriveFallbackTopics(memory) {
    const candidates = [memory.knowledge_category, memory.subject, memory.key]
        .filter(Boolean)
        .map(t => String(t).trim().toLowerCase().replace(/\s+/g, '_'))
        .filter(Boolean);
    return [...new Set(candidates)];
}

async function extractMemory(
    message,
    workingContext = {}
) {

    // Registry identity and a reference in this message are both required.
    // Active context alone must not attach unrelated entities to a project.
    let projectRows = [];
    try {
        projectRows = await projectRegistry.getAllProjects();
    } catch (error) {
        console.error(
            '[MemoryExtractor] Failed to load registered projects:',
            error.message
        );
    }

    const scopedProjects = projectExtractionScope(message, projectRows, workingContext);
    const projectKeys = scopedProjects
        .map(project => project.project_key)
        .filter(Boolean);

    const registeredProjectsText =
        scopedProjects.length > 0
            ? scopedProjects
                .map(project => `- project_key: "${project.project_key}" (name: "${project.name}"${
                    Array.isArray(project.aliases) && project.aliases.length > 0
                        ? `, aliases: ${project.aliases.map(a => `"${a}"`).join(', ')}`
                        : ''
                })`)
                .join('\n')
            : 'None';

    const projectContextInstruction =
        scopedProjects.length > 0
            ? `
The project list above contains the registered projects referenced by this message.
The active project alone does not establish ownership of an unrelated named entity.

If the user's message clearly refers to one of these
registered projects (by name, project_key, or alias), you
may create a project memory for it. Set "project_key" to the
EXACT project_key value shown above - never the display name,
never an alias, and never a generic domain word like "memory"
or "project". If you cannot confidently match the message to
one specific project_key from the list, do NOT emit a
category:"project" memory at all - use "knowledge" instead.

Do NOT reject a project fact merely because Active Project
is None. A project can be referenced explicitly without
being the currently active project.
`
            : `
No registered project is referenced by this message.
Category "project" is unavailable for this call, even if a project is active.
Facts about other named services, software, or entities belong to
knowledge; do not discard them merely because they are not registered projects.
`;

    const prompt = `
You are Alice's fallback memory classifier. An earlier pattern
matcher found nothing. Nothing from this message has been saved yet.
Extract its persistent information even when the wording is simple.

If the message contains only a question, command, request, filler,
or ordinary response with no persistent information, return an
empty memories array. A request to remember a stated fact does contain
persistent information. A reported completed change or correction is
also information: preserve what changed and the new state in its value.
A request to perform a change is not evidence that it has happened.

CURRENT CONTEXT:
- Active Project: ${workingContext.current_project || 'None'}
- Current Topic: ${workingContext.current_topic || 'None'}

PROJECTS REFERENCED BY THIS MESSAGE:
${registeredProjectsText}

${projectContextInstruction}

USER MESSAGE:
"${message}"

MEMORY CATEGORIES:
- project: persistent fact about a REGISTERED project (architecture,
  components, files, dependencies, integrations, config, tests,
  logs, performance, capabilities, limitations, structure, etc.)
- procedure: a rule for HOW Alice should behave, reason, format
  responses, or interact with the user
- preference: the user's preferred way of receiving info / having
  something done
- identity: stable fact about the user or Alice
- relationship: persistent link between people, Alice, projects, or
  other entities
- state: current/temporary info that may change over time
- history: past events/decisions still relevant
- knowledge: general fact not tied to a registered project
- behavior: recurring pattern in the user's own behavior

PROJECT vs PROCEDURE: if the message describes how a PROJECT WORKS,
use "project", even if it describes a process. If it describes how
ALICE SHOULD BEHAVE OR PERFORM A TASK, use "procedure".

"Bindex uses email verification to create an account" → project
"Bindex uses Supabase for authentication" → project
"When helping me create an account, remind me to verify my email" → procedure
"Whenever you give me information, use bullet points" → procedure
"I prefer bullet points" → preference
"The current project is Bindex" → state

PROJECT MEMORY FIELDS
- project_key: REQUIRED for category:"project". Must be the exact
  project_key string from the REGISTERED PROJECTS list above - copy
  it verbatim. Never the project's display name, never an alias,
  never a subject/domain word. If no single project_key confidently
  matches, do not use category:"project" at all.
- subject: broad project area the fact belongs to (memory, database,
  authentication, frontend, backend, architecture, files, features,
  integrations, deployment, configuration, testing, logging,
  performance, models, reasoning, voice). Never the project name and
  never the project_key - subject and project_key answer different
  questions (WHICH project vs WHAT part of it).
  Don't invent an overly specific subject for every fact.
- topics: 2-5 retrieval terms. NOT relationship words (uses,
  requires, supports, contains, depends_on, connects_to, because,
  because_of).
- key: concise snake_case identity for WHAT the fact is about
  (supabase, context_manager, email_verification) - not prefixed
  with a verb (bad: uses_supabase, project_uses_supabase).
  Canonical identity = project_key + subject + key; topics are just
  retrieval metadata, not identity.
- value: the fact itself, concise but preserving important meaning.

PROCEDURAL MEMORY FIELDS (trigger/action/context are ALL mandatory)
- subject: broad behavioral domain (response_formatting,
  communication, coding, explanations, research, memory, reasoning,
  planning, interaction, workflow, preferences). Never the user's
  literal sentence, and never a project name unless the procedure is
  explicitly project-specific.
- topics: 2-5 retrieval terms describing when this procedure is
  relevant (e.g. step_by_step, technical_explanations,
  beginner_friendly, code_examples, troubleshooting).

Topics are retrieval metadata, not grammatical relationship words -
do not use: uses, requires, supports, because, should, always, when,
whenever.
- key: concise canonical snake_case identity for WHAT rule this is
  (good: step_by_step_explanations, concise_code_examples; bad:
  when_explaining_technical_concepts, should_provide_step_by_step).
  Canonical identity = category + subject + key. Do NOT use the
  literal trigger as the key - different wording for the same rule
  should resolve to the same key, e.g. "When explaining technical
  things, go step by step", "Break technical explanations down step
  by step", and "Explain technical concepts one step at a time" all
  canonicalize to key: step_by_step_explanations.
- value: the full rule, concise but complete - WHAT Alice should do,
  and WHEN/in what situation, if that condition matters. Never a
  vague label (bad: "Bullet point formatting"; good: "Use bullet
  points when giving long explanations.").
- trigger: the condition under which the procedure applies (e.g.
  "when explaining technical concepts").
- action: the concrete behavior Alice should perform (e.g. "provide
  step-by-step explanations").
- context: narrower execution context (e.g. "technical_explanations"),
  or "general" if there isn't one.

trigger, action, and context are ALL mandatory whenever category is
"procedure" - the memory is invalid without them, even if every
other field is present.

KNOWLEDGE MEMORY FIELDS
Knowledge is a fact/definition/concept/relationship/observation/
claim/assumption/hypothesis about the world, a technology, or an
entity - NOT a fact about a registered project (that's "project")
and NOT a rule about how Alice should behave (that's "procedure").
"Python was created by Guido van Rossum" → knowledge. "Bindex uses
Python for its backend" → project. "Always write Python with type
hints" → procedure.
- subject: the specific entity/concept that OWNS the property in the message.
  Preserve its name; do not substitute the property's name or its new value.
  The owner stays the same when its property changes.
  Examples of entities:
  (earth, python, http, mars, photosynthesis) - not the broad field,
  and never a registered project name.
- knowledge_category: ONE broad knowledge domain (science,
  technology, history, geography, culture, programming, mathematics,
  biology, physics, general). This is knowledge's own domain
  classification - unrelated to the outer "category" field above
  (which is always "knowledge" for these memories).
- topics: 2-5 retrieval terms (e.g. astronomy, solar_system for an
  earth/moon fact). Retrieval metadata only, not identity.
- key: concise snake_case identity for the specific property/fact
  (release_year, creator, orbital_period, natural_satellite,
  definition, programming_language). Canonical identity =
  knowledge_category + subject + key.
- value: a self-contained statement retaining the named entity, property,
  and value (e.g. "Earth's natural satellite is the Moon"). Preserve
  negation, uncertainty, scope, and reported transitions. Do not reduce
  a completed replacement to its new value alone.
- type: the semantic nature of the knowledge - fact, definition,
  concept, relationship, observation, claim, assumption, or
  hypothesis. Use "assumption" or "claim" (not "fact") for anything
  hedged or uncertain (e.g. "I suspect this API uses OAuth" is an
  assumption, not an established fact).
- source_type: how this was learned - "user_statement" if the user
  directly told you, "conversation" for anything else inferred from
  the conversation. (Other source types like web_search/document/
  tool/model_knowledge/reasoning apply to acquisition paths this
  classifier doesn't handle yet.)

EXAMPLE

User: "Whenever you're explaining something technical to me, break it down step by step."
{
    "memories": [
        {
            "category": "procedure",
            "subject": "explanations",
            "topics": ["step_by_step", "technical_explanations"],
            "key": "step_by_step_explanations",
            "value": "When explaining technical concepts, break them down step by step.",
            "trigger": "when explaining technical concepts",
            "action": "break it down step by step",
            "context": "general",
            "confidence": 0.9
        }
    ],
    "conversation_update": {}
}

User: "The Pacific Ocean is the largest ocean on Earth."
{
    "memories": [
        {
            "category": "knowledge",
            "subject": "pacific_ocean",
            "knowledge_category": "geography",
            "topics": ["oceans", "earth"],
            "key": "size_rank",
            "value": "The Pacific Ocean is the largest ocean on Earth.",
            "type": "fact",
            "source_type": "conversation",
            "confidence": 0.95
        }
    ],
    "conversation_update": {}
}

OUTPUT REQUIREMENTS

Every memory object MUST have a category, one of: preference,
behavior, identity, relationship, state, history, project,
knowledge, procedure. Never omit it - for procedures it must be
exactly "procedure".

QUALITY RULES
- Only extract what's actually stated or strongly implied. Never
  invent facts. Never turn Alice's own suggestions into user
  memories.
- Prefer specific keys over vague keys. Use snake_case. Don't create
  duplicates.
- Only create project memories for registered projects. Never use
  the project name as subject.
- If uncertain whether something is persistent information, prefer
  returning no memory over inventing one.
- A miss by the earlier pattern matcher is not a reason to omit
  a fact. Simple statements and completed corrections about an
  entity's components, dependencies, capabilities, limitations,
  or observed behavior are valid information too.

Return ONLY valid JSON:

{
    "memories": [
        {
            "category": "preference|behavior|identity|relationship|state|history|project|knowledge|procedure",
            "subject": "semantic_subject",
            "topics": ["topic_1", "topic_2"],
            "key": "snake_case_key",
            "value": "concise_value",
            "trigger": "when this memory applies",
            "action": "what Alice should do",
            "context": "narrow execution context",
            "confidence": 0.9
        }
    ],
    "conversation_update": {
        "current_topic": "Updated topic if changed",
        "recent_decisions": [
            "Any decisions made in this message"
        ]
    }
}

If nothing should be remembered:

{
    "memories": [],
    "conversation_update": {}
}
`;

    try {

        // Routed through the shared background-memory queue so this
        // never fires concurrently against the same local Ollama
        // instance as a semantic-enrichment call or another
        // extraction pass - see llmQueue.js. Deliberately NOT passing
        // a `context` (num_ctx) override here - Ollama loads a model
        // at a fixed context size, and requesting a different num_ctx
        // on this call than whatever the model is already loaded with
        // forces a full unload/reload, which was silently causing
        // this call to fail under load and fall back to nothing
        // saved instead of actually speeding anything up.
        //
        // `format: EXTRACTION_SCHEMA` (defined above) is what
        // actually guarantees a parseable response - see the comment
        // on that schema for why prompt-only instructions and
        // `think: false` alone weren't enough. maxTokens is sized for
        // a handful of memory objects' worth of JSON, not for
        // reasoning padding - schema-constrained decoding means there
        // is no reasoning padding to pad for anymore.
        const response =
            await llmQueue.enqueue(() =>
                modelAdapter.complete(
                    [
                        {
                            role: 'system',
                            content:
                                'You are a JSON API. Output ONLY a single valid JSON object - no explanation, no reasoning, no step-by-step work, nothing before or after it.'
                        },
                        {
                            role: 'user',
                            content: `${prompt}\n\n/no_think`
                        }
                    ],
                    {
                        think: false,
                        temperature: 0.1,
                        maxTokens: 600,
                        format: buildExtractionSchema(projectKeys)
                    }
                )
            );

        const parsed =
            extractJSON(response);

        if (parsed) {

            // Normalize an accidentally unwrapped single memory.
            if (
                !Array.isArray(parsed.memories) &&
                parsed.category
            ) {
                parsed.memories = [parsed];
            }

            if (Array.isArray(parsed.memories)) {

                // Defense for providers that do not enforce the supplied schema.
                // Do not invent a knowledge subject by relabeling invalid projects.
                parsed.memories = parsed.memories.filter(memory => {
                    if (memory?.category !== 'project' || projectKeys.includes(memory.project_key)) return true;
                    console.warn('[MemoryExtractor] Rejected project extraction without a message-grounded project_key.');
                    return false;
                });

                parsed.memories = parsed.memories.map(memory => {

                    if (
                        memory &&
                        memory.category === 'procedure' &&
                        (
                            memory.confidence === undefined ||
                            memory.confidence === null
                        )
                    ) {
                        memory.confidence = 0.9;
                    }

                    // Deterministic defaulting, not another model
                    // call - knowledgeLibrary.js's buildRow() would
                    // apply the same defaults on write anyway, but
                    // filling them in here keeps the memory object
                    // itself accurate for any code (deduplication
                    // logging, tests) that inspects it before it
                    // reaches storage.
                    if (memory && memory.category === 'knowledge') {
                        if (!memory.type) {
                            memory.type = 'fact';
                        }

                        if (!Array.isArray(memory.topics) || memory.topics.length === 0) {
                            memory.topics = deriveFallbackTopics(memory);
                        }

                        if (!memory.source_type) {
                            memory.source_type = 'conversation';
                        }

                        if (
                            memory.confidence === undefined ||
                            memory.confidence === null
                        ) {
                            memory.confidence = 0.85;
                        }
                    }

                    return memory;
                });

                return parsed;
            }
        }

        console.log(
            '[MemoryExtractor] Failed to parse memories from response:',
            safePreview(response)
        );

        return {
            memories: [],
            conversation_update: {}
        };

    } catch (error) {

        console.error(
            '[MemoryExtractor] Memory extraction failed:',
            error.message
        );

        return {
            memories: [],
            conversation_update: {}
        };
    }
}

module.exports = {
    extractMemory,
    EXTRACTION_SCHEMA,
    buildExtractionSchema
};
