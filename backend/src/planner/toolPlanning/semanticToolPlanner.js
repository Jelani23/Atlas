const { createModelAdapter } = require('../../models/modelAdapter');
const modelRouter = require('../../models/modelRouter');
const { extractJSON } = require('../../utils/jsonExtractor');
const { getToolArguments } = require('../../tools/toolArguments');

function buildToolCatalog(schemas) {
    return schemas.filter(schema => getToolArguments(schema.name) !== null).map(schema => ({
        name: schema.name,
        domain: schema.domain,
        description: schema.description || null,
        parameters: getToolArguments(schema.name),
        examples: schema.examples || (Array.isArray(schema.triggers) ? schema.triggers.slice(0, 4) : [])
    }));
}

function createSemanticToolPlanner({ adapter = createModelAdapter() } = {}) {
    return async function proposeSemanticPlan({ message, segments, schemas, requestId = null }) {
        const prompt = `Map each request clause to exactly one available tool, or null when it is conversational, ambiguous, missing a target, or unsupported.

Rules:
- Keep the clauses in their original order.
- Never invent a filename, record ID, note name, search query, or other argument.
- Use args in the tool's function argument order.
- args contains positional values, never parameter objects. For example: [12, "cm", "m"], NOT [{"value":12},{"fromUnit":"cm"},{"toUnit":"m"}]. Numbers must be JSON numbers; text must be JSON strings.
- The ordered parameters define required inputs. Extract them from the clause; do not return empty args for a tool with required inputs. A variadic parameter occupies separate args, one per value. Optional trailing inputs may be omitted.
- Confidence must reflect semantic certainty, not whether the action seems useful.
- Return JSON only.

Full request: ${JSON.stringify(message)}
Clauses: ${JSON.stringify(segments)}
Tools: ${JSON.stringify(buildToolCatalog(schemas))}

For calculate, translate spoken arithmetic to a numeric expression before filling args: number words become digits and operators become +, -, *, or /. This is format conversion, not inventing an argument. Return the expression, not its evaluated answer. If the arithmetic is ambiguous, use null.

Return: {"steps":[{"toolName":"toolName or null","args":[],"confidence":0.0}]}`;

        const response = await adapter.complete([
            { role: 'system', content: 'You are a conservative tool-routing JSON API.' },
            { role: 'user', content: prompt }
        ], {
            think: false,
            temperature: 0,
            maxTokens: 700,
            format: 'json',
            requestId: requestId ? `${requestId}:tool-plan` : undefined,
            ...modelRouter.getDefaultModel()
        });
        return extractJSON(response);
    };
}

function isSemanticPlanningEnabled() {
    return !['false', 'off', 'disabled', '0']
        .includes(String(process.env.SEMANTIC_MULTI_TOOL_PLANNING || 'true').toLowerCase());
}

module.exports = {
    createSemanticToolPlanner,
    buildToolCatalog,
    isSemanticPlanningEnabled
};
