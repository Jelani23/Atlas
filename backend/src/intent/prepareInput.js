const state = require('../planner/state');
const { interpret } = require('./inputUnderstanding');
const tasks = require('./conversationalTask');
const { parseScreenRequest } = require('../../../shared/screenIntent');
async function prepare(text, { sessionId, interaction, screens }, dependencies = {}) {
    const scope = state.runInSession(sessionId, () => state.getSessionScope());
    const sameClient = scope.visualWordle?.connectionId === interaction.connectionId;
    const recent = scope.taskFocus?.connectionId === interaction.connectionId && Date.now() - scope.taskFocus.at < 1800000;
    const approvals = require('../permissions/permissionManager').pendingRequests;
    const continuity = require('./conversationContinuity').get(scope, interaction.connectionId);
    const context = { activeTask: sameClient ? 'wordle' : null, recentTask: recent ? 'wordle' : null,
        pendingApproval: Boolean(scope.pendingAction || scope.pendingPlan || [...approvals.values()].some(r => r.scope === scope)),
        recentTurns: (scope.inputRecent || []).filter(r => r.connectionId === interaction.connectionId).slice(-4).map(r => r.text),
        conversation: continuity ? { turns: continuity.turns, lastTask: continuity.task } : null,
        displays: (screens?.displays || []).map((display, index) => ({ number: index + 1, current: Boolean(display.current), primary: Boolean(display.primary) })) };
    const parsed = await (dependencies.interpret || interpret)(text, context, dependencies);
    console.log('[InputUnderstanding] ' + JSON.stringify({ disposition: parsed.disposition, source: parsed.source, elapsedMs: parsed.elapsedMs, clauses: parsed.clauses.length, reason: parsed.reason }));
    const metadata = { disposition: parsed.disposition, source: parsed.source, elapsedMs: parsed.elapsedMs, reason: parsed.reason,
        clauses: parsed.clauses.map(c => ({ kind: c.kind, domain: c.domain, confidence: c.confidence })) };
    if (parsed.disposition === 'clarify') return { task: 'input', action: 'clarify', interpretation: metadata,
        reply: parsed.reason === 'mixed_adapters' ? 'I heard requests for different activities. Which should I handle first? I haven’t run any of them yet.'
            : parsed.source === 'unavailable' ? 'My local input interpreter could not finish. No tools ran; please try again.'
            : 'I’m not sure whether you want me to do something or discuss it. Could you clarify the request?' };
    if (parsed.disposition === 'chat') return { task: 'input', action: 'chat', interpretation: metadata };
    // Only repeat pure numerical operations from exact saved arguments. Never
    // replay file writes, transactions, or other actions from conversational hints.
    const reference = parsed.requests?.[0]?.reference;
    if (parsed.disposition === 'tools' && reference && reference !== 'none' && continuity?.task?.numericRequests?.length) {
        const numeric = continuity?.task?.numericRequests || [];
        const selected = numeric.filter(request => reference === 'numeric' || request.toolName === reference);
        if (selected.length) return { task: 'input', action: 'legacy',
            requestText: selected.map(request => request.toolName === 'calculate' ? `Calculate ${request.args[0]}`
                : `Count the words in ${JSON.stringify(request.args[0])}`).join('; '), interpretation: metadata };
        return { task: 'input', action: 'clarify', reply: 'Which text or calculation should I check again?', interpretation: metadata };
    }
    if (parsed.disposition === 'devices') return { task: 'devices', action: 'read', query: parsed.requests[0].deviceQuery || { scope: 'all', topic: 'status', name: '' }, interpretation: metadata };
    if (parsed.disposition === 'tools') return { task: 'input', action: 'legacy', requestText: parsed.requests.length === parsed.clauses.length ? text : parsed.requests.map(c => c.text.trim()).join('; '), interpretation: metadata };
    const clause = parsed.requests[0];
    const screen = clause.domain === 'screen' ? parseScreenRequest(clause.text) : null;
    const literalTarget = tasks.targetFromText(clause.text);
    const semanticTarget = clause.target;
    // Literal conflicting targets must never be silently overridden by a model.
    // The proposal selects a registered display only; resolve still enforces
    // client identity, inventory bounds and existing tool permissions.
    const target = literalTarget.ambiguous || literalTarget.monitor != null || literalTarget.relative ? literalTarget
        : semanticTarget ? { monitor: semanticTarget.relative === 'numbered' ? semanticTarget.monitor : null,
            relative: ['current', 'other'].includes(semanticTarget.relative) ? semanticTarget.relative : null,
            ambiguous: semanticTarget.relative === 'ambiguous' }
        : screen ? { monitor: screen.monitorNumber, relative: screen.relative } : literalTarget;
    const route = await tasks.resolve(clause.text, { sessionId, interaction, screens }, {
        ...dependencies, task: clause.domain, intent: { action: clause.action, ...target },
    });
    return { ...route, interpretation: metadata };
}
module.exports = { prepare };
