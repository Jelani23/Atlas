const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const projectRegistry = require('./projectRegistry');

const modelAdapter = createModelAdapter();

async function extractMemory(
    message,
    workingContext = {}
) {

    let registeredProjects = Array.isArray(
        workingContext.registered_projects
    )
        ? workingContext.registered_projects
            .map(project => {

                if (typeof project === 'string') {
                    return project;
                }

                return project.name ||
                    project.project_key ||
                    null;
            })
            .filter(Boolean)
        : [];

    if (registeredProjects.length === 0) {
        try {
            const projects =
                await projectRegistry.getAllProjects();

            registeredProjects = projects
                .flatMap(project => [
                    project.name,
                    project.project_key,
                    ...(Array.isArray(project.aliases)
                        ? project.aliases
                        : [])
                ])
                .filter(Boolean);

        } catch (error) {

            console.error(
                '[MemoryExtractor] Failed to load registered projects:',
                error.message
            );
        }
    }

    const registeredProjectsText =
        registeredProjects.length > 0
            ? registeredProjects
                .map(project => `- ${project}`)
                .join('\n')
            : 'None';

    const projectContextInstruction =
        registeredProjects.length > 0
            ? `
The project registry above is authoritative.

If the user's message clearly refers to one of these
registered projects, you may create a project memory for it.

Do NOT reject a project fact merely because Active Project
is None. A project can be referenced explicitly without
being the currently active project.
`
            : `
No registered projects are available to the fallback
classifier. Do not create project memories for named
projects unless the current context explicitly identifies
the project as registered.
`;

    const prompt = `
You are the fallback memory classifier.

A deterministic memory extractor runs BEFORE you.

If deterministic extraction already recognizes a memory,
this classifier will not normally be used.

Your job is to detect persistent information that the
deterministic extractor did NOT recognize.

Determine whether the user's message contains persistent
information worth storing.

If the message is a question, command, request, conversational
filler, speculation, or ordinary response with no persistent
information, return an empty memories array.

CURRENT CONTEXT:

- Active Project: ${workingContext.current_project || 'None'}
- Current Topic: ${workingContext.current_topic || 'None'}

REGISTERED PROJECTS:
${registeredProjectsText}

${projectContextInstruction}

USER MESSAGE:
"${message}"


MEMORY CATEGORIES:

project:
Persistent facts about a specific registered project.

Examples include:
- architecture
- implementation details
- components
- files
- dependencies
- integrations
- configuration
- requirements
- limitations
- authentication behavior
- data storage
- APIs
- frameworks
- technologies
- tests
- logs
- performance
- capabilities
- project structure

procedure:
Rules or learned instructions about HOW Alice should perform tasks,
reason, process information, format responses, or interact with the user.

preference:
The user's preferred way of receiving information or having something done.

identity:
Stable information about the user or Alice.

relationship:
Persistent information about relationships between people,
Alice, projects, or other entities.

state:
Current or temporary information that may change over time.

history:
Important past events, completed work, or previous decisions
that remain relevant.

knowledge:
General factual information not specifically about a registered project.

behavior:
Recurring patterns in the user's behavior that are useful to remember.


IMPORTANT PROJECT VS PROCEDURE DISTINCTION:

If the message describes HOW A PROJECT WORKS, use "project".

If the message describes HOW ALICE SHOULD BEHAVE OR PERFORM A TASK,
use "procedure".

Do not classify a project fact as a procedure simply because the
fact describes a process.

Examples:

"Bindex uses email verification to create an account"
→ project

"Bindex requires users to verify their email"
→ project

"Bindex uses Supabase for authentication"
→ project

"When helping me create an account, remind me to verify my email"
→ procedure

"Whenever you give me information, use bullet points"
→ procedure

"Always summarize long search results before showing them to me"
→ procedure

"I prefer bullet points"
→ preference

"The current project is Bindex"
→ state


PROJECT MEMORY STRUCTURE:

Project memories use four semantic layers.

1. subject

A broad semantic domain describing what area of the project
the memory belongs to.

Examples:
- memory
- database
- authentication
- frontend
- backend
- architecture
- files
- features
- integrations
- deployment
- configuration
- testing
- logging
- performance
- models
- reasoning
- voice

Do not use the project name.

Do not invent a highly specific subject for every individual fact.


2. topics

2-5 conceptual retrieval terms.

Topics may describe:
- technologies
- components
- files
- systems
- behaviors
- concepts
- domains

Topics are NOT grammatical relationship words.

Do not use:
- uses
- requires
- supports
- contains
- depends_on
- connects_to
- because
- because_of


3. key

The canonical identity of the individual fact.

Use concise snake_case.

Good:
- supabase
- context_manager
- email_verification
- stripe
- project_database
- memory_cache

Bad:
- uses_supabase
- project_uses_supabase
- uses_email_verification

The key identifies WHAT the memory is about.

The canonical project-memory identity is:

project_key + subject + key

Topics are retrieval metadata and are NOT part of canonical identity.


4. value

The actual information being remembered.

Keep it concise while preserving important meaning.

PROCEDURAL MEMORY STRUCTURE:

Procedural memories represent learned rules about HOW Alice should
behave, reason, perform tasks, format information, or interact with
the user.

Procedural memory uses four semantic layers.

1. subject

The broad semantic domain in which the procedure applies.

Examples:
- response_formatting
- communication
- coding
- explanations
- research
- memory
- reasoning
- planning
- interaction
- workflow
- preferences

The subject should describe the DOMAIN of the procedure.

Do not use the user's exact sentence as the subject.
Do not use a project name as the subject unless the procedure is
explicitly project-specific and the project is part of the intended
semantic domain.

2. topics

2-5 conceptual retrieval terms that help determine when this
procedure may be relevant.

Examples:
- step_by_step
- technical_explanations
- beginner_friendly
- code_examples
- troubleshooting

Topics are retrieval metadata.

Topics are NOT grammatical relationship words.

Do not use:
- uses
- requires
- supports
- because
- should
- always
- when
- whenever

3. key

The canonical identity of the individual procedural rule.

Use concise snake_case.

Good:
- step_by_step_explanations
- concise_code_examples
- explain_reasoning
- summarize_search_results

Bad:
- when_explaining_technical_concepts
- user_wants_step_by_step
- should_provide_step_by_step_explanations

The key identifies WHAT procedural rule is being remembered.

The canonical procedural-memory identity is:

category + subject + key

Topics are retrieval metadata and are NOT part of canonical identity.

4. value

The canonical procedural rule itself.

Keep it concise, explicit, reusable, and semantically complete.

The value must preserve the important meaning of the user's
instruction. Canonicalization may normalize wording, but MUST NOT
remove meaningful behavioral or situational information.

The value should clearly communicate:

- WHAT Alice should do.
- WHEN or in what situation the behavior applies, when that
  condition is important to the rule.
- Any important interaction constraint expressed by the user.

Do not reduce a procedural rule to a vague label or summary.

Bad:

"Step-by-step problem walkthrough"

Good:

"When troubleshooting problems, walk through the issue step by step
instead of only giving the solution."

Bad:

"Technical explanation formatting"

Good:

"When explaining technical concepts, break them down step by step."

Bad:

"Bullet point formatting"

Good:

"Use bullet points when giving long explanations."

Canonicalization should normalize equivalent wording, but it should
preserve the actual behavioral rule.

5. trigger

A concise description of the condition under which the procedure
applies.

Example:

"when explaining technical concepts"

The trigger is transitional storage metadata and should NOT be used
as the canonical identity.

6. action

The concrete behavior Alice should perform when the trigger applies.

Example:

"provide step-by-step explanations"

The action is transitional storage metadata and should NOT be used
as the canonical identity.

7. context

The narrower execution context in which the procedure applies.

Example:

"technical_explanations"

Context is transitional metadata and should NOT determine identity.

PROCEDURAL MEMORY EXTRACTION RULES:

When category is "procedure":

- subject must identify the semantic domain.
- topics must contain 2-5 useful retrieval concepts.
- key must be a concise canonical snake_case identifier.
- value must describe the reusable behavior Alice should perform.
- trigger MUST be included for every procedure.
- trigger describes the condition under which the procedure applies.
- action MUST be included for every procedure.
- action describes the concrete behavior Alice should perform.
- context MUST be included for every procedure.
- context describes the narrower domain or execution context.
- confidence should reflect how clearly the user established the rule.

Prefer canonical identifiers over literal wording.

Example:

User:
"Whenever you're explaining something technical to me, break it
down step by step."

OUTPUT REQUIREMENTS:

Every memory object MUST contain a category field.

The category field is mandatory and must be one of:

- preference
- behavior
- identity
- relationship
- state
- history
- project
- knowledge
- procedure

Never omit category.

For procedural memories specifically:

category MUST be "procedure".

Even when all other procedural fields are present, the memory is
invalid if category is missing.

Return:

{
    "memories": [
        {
            "category": "procedure",
            "subject": "response_formatting",
            "topics": [
                "long_explanations",
                "bullet_points"
            ],
            "key": "bullet_points_for_long_explanations",
            "value": "Use bullet points for long explanations.",
            "trigger": "when giving long explanations",
            "action": "use bullet points",
            "context": "response_formatting",
            "confidence": 0.9
        }
    ],
    "conversation_update": {}
}

Do NOT use the literal trigger as the key.

The following should all resolve to the same canonical procedure:

"When explaining technical things, go step by step."

"Break technical explanations down step by step."

"Explain technical concepts one step at a time."

These may have different wording, but they represent the same
underlying procedural rule.

The canonical key should therefore remain:

step_by_step_explanations


MEMORY QUALITY RULES:

- Only extract information actually stated or strongly implied.
- Never invent facts.
- Never turn Alice's own suggestions into user memories.
- Prefer specific keys over vague keys.
- Use snake_case.
- Do not create duplicates.
- Confidence should reflect the evidence.
- Only create project memories for registered projects.
- Do not use the project name as subject.
- Do not turn semantic interpretation into arbitrary vocabulary.
- If uncertain whether something is persistent information, prefer
  returning no memory rather than inventing one.


IMPORTANT:

The deterministic extractor is responsible for recognizing known
sentence structures.

You are the fallback.

Therefore, focus especially on project facts expressed in unusual
or less predictable language structures that the deterministic
extractor may not recognize.

Examples include statements about:

- project components
- files
- logs
- test results
- architecture
- implementation
- configuration
- capabilities
- limitations
- causes
- dependencies
- observed behavior

Do not require a specific verb such as "uses" or "has".


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

        const response =
            await modelAdapter.complete(
                [
                    {
                        role: 'system',
                        content:
                            'You are a JSON API. Output only valid JSON. Do not reason unnecessarily.'
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
    extractMemory
};