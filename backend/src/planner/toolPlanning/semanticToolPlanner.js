const { createModelAdapter } = require('../../models/modelAdapter');
const modelRouter = require('../../models/modelRouter');
const { extractJSON } = require('../../utils/jsonExtractor');

function buildToolCatalog(schemas) {
    return schemas.map(schema => ({
        name: schema.name,
        domain: schema.domain,
        description: schema.description || null,
        parameters: schema.parameters || null,
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
- Confidence must reflect semantic certainty, not whether the action seems useful.
- Return JSON only.

Full request: ${JSON.stringify(message)}
Clauses: ${JSON.stringify(segments)}
Tools: ${JSON.stringify(buildToolCatalog(schemas))}

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
