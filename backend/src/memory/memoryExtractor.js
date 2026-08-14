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

        if (
            parsed &&
            Array.isArray(parsed.memories)
        ) {
            return parsed;
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