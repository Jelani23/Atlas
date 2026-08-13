// backend/src/memory/memoryExtractor.js

const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');

const modelAdapter = createModelAdapter();

async function extractMemory(message, workingContext = {}) {

    const registeredProjects = Array.isArray(
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

    const registeredProjectsText =
        registeredProjects.length > 0
            ? registeredProjects.map(project => `- ${project}`).join('\n')
            : 'None';

    const prompt = `
You are a memory classifier.

Determine whether the user's message contains persistent information
worth storing.

If the message is a question, command, request, or conversational filler
with no persistent information, return an empty memories array.

CURRENT CONTEXT:

- Active Project: ${workingContext.current_project || 'None'}
- Current Topic: ${workingContext.current_topic || 'None'}

REGISTERED PROJECTS:
${registeredProjectsText}

USER MESSAGE:
"${message}"


MEMORY CATEGORIES:

project:
Persistent facts about a specific registered project.

This includes:
- how the project works
- project features
- architecture
- implementation details
- dependencies
- integrations
- configuration
- requirements
- limitations
- authentication behavior
- data storage
- APIs
- frameworks or technologies used
- anything else that describes how the project works

procedure:
Rules or learned instructions about HOW Alice should perform tasks,
reason, process information, format responses, or interact with the user.

preference:
The user's preferred way of receiving information or having something done.

identity:
Stable information about the user or Alice.

relationship:
Persistent information about relationships between people, Alice,
projects, or other entities.

state:
Current or temporary information that may change over time.

history:
Important past events, completed work, or previous decisions that remain
relevant.

knowledge:
General factual information that is not specifically about a registered
project.

behavior:
Recurring patterns in the user's behavior that are useful to remember.


IMPORTANT PROJECT VS PROCEDURE DISTINCTION:

If the message describes HOW A PROJECT WORKS, use "project".

If the message describes HOW ALICE SHOULD BEHAVE OR PERFORM A TASK,
use "procedure".

Do not classify a project fact as a procedure simply because the fact
describes a process.

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


PROJECT RULES:

1. Only use category "project" for a registered project.
2. Never invent a project.
3. If the message refers to the active project, use that project.
4. For project memories, use the project's name or project_key as the subject.
5. If the message contains a project fact, do not classify it as procedure
   unless the user is explicitly instructing Alice how to behave.
6. Project facts should describe persistent characteristics rather than
   temporary conversational state.


MEMORY QUALITY RULES:

- Only extract information actually stated or strongly implied by the user.
- Do not invent additional facts.
- Do not turn Alice's own suggestions into user memories.
- Keep values concise but preserve the important meaning.
- Use snake_case for keys.
- Prefer specific keys over vague keys.
- Do not create duplicate memories when the same fact is restated.
- Confidence should reflect how clearly the message supports the memory.


Return ONLY valid JSON in this exact format:

{
    "memories": [
        {
            "category": "preference|behavior|identity|relationship|state|history|project|knowledge|procedure",
            "subject": "user|atlas|<registered_project>",
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

If nothing should be remembered, return:

{
    "memories": [],
    "conversation_update": {}
}
`;

    try {
        const response = await modelAdapter.complete(
            [
                {
                    role: 'system',
                    content: 'You are a JSON API. Output only valid JSON.'
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
            parsed &&
            parsed.memories &&
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