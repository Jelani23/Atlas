// One local interpretation pass. Proposals contain exact source clauses, not
// rewritten instructions, tool arguments, or execution permissions.
const { isScreenRequest } = require('../../../shared/screenIntent');
const { parseVisualWordle } = require('../../../shared/visualWordleIntent');
const KINDS = ['chat', 'request', 'clarify'];
const DOMAINS = ['general', 'screen', 'wordle', 'tools', 'devices'];
const ACTIONS = ['none', 'inspect', 'start', 'read', 'stop', 'execute'];
const schema = { type: 'object', additionalProperties: false, required: ['wholeMessage', 'clauses'], properties: {
    wholeMessage: { type: 'boolean' },
    clauses: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false,
        required: ['text', 'kind', 'domain', 'action', 'confidence', 'target'], properties: {
            text: { type: 'string' }, kind: { enum: KINDS }, domain: { enum: DOMAINS }, action: { enum: ACTIONS },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reference: { enum: ['none', 'wordCount', 'calculate', 'numeric'] },
            deviceQuery: { type: 'object', additionalProperties: false, required: ['scope', 'topic', 'name'], properties: {
                scope: { enum: ['current', 'all', 'named'] },
                topic: { enum: ['status', 'capabilities', 'displays', 'details'] },
                name: { type: 'string' },
            } },
            target: { type: 'object', additionalProperties: false, required: ['relative', 'monitor'], properties: {
                relative: { enum: ['default', 'current', 'other', 'numbered', 'ambiguous'] },
                monitor: { type: 'integer', minimum: 0, maximum: 100 },
            } },
        } } },
} };
function outputSchema(context) {
    const properties = { route: { enum: ['chat', 'tools', 'screen', 'wordle_start', 'wordle_read', 'wordle_stop', 'devices', 'clarify'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 }, target: schema.properties.clauses.items.properties.target,
        deviceQuery: schema.properties.clauses.items.properties.deviceQuery };
    if (context.conversation?.lastTask?.numericRequests?.length) properties.reference = schema.properties.clauses.items.properties.reference;
    return { type: 'object', additionalProperties: false,
        required: ['route', 'confidence', 'target', ...(properties.reference ? ['reference'] : [])], properties };
}
function decode(message, value) {
    if (!value?.route) return value; // Existing callers/fixtures retain the clause contract.
    const routes = { chat: ['chat','general','none'], clarify: ['clarify','general','none'], tools: ['request','tools','execute'],
        screen: ['request','screen','inspect'], devices: ['request','devices','read'],
        wordle_start: ['request','wordle','start'], wordle_read: ['request','wordle','read'], wordle_stop: ['request','wordle','stop'] };
    const route = routes[value.route];
    if (!route) throw new Error('Invalid route');
    const [kind, domain, action] = route;
    return { wholeMessage: true, clauses: [{ text: message, kind, domain, action, confidence: value.confidence,
        target: value.target, ...(value.deviceQuery ? { deviceQuery: value.deviceQuery } : {}),
        ...(value.reference ? { reference: value.reference } : {}) }] };
}
function validate(message, value) {
    if (!value || !Array.isArray(value.clauses) || !value.clauses.length || value.clauses.length > 8) throw new Error('Invalid input interpretation');
    if (value.wholeMessage === true) {
        if (value.clauses.length !== 1) throw new Error('Whole message must have one classification');
        value = { clauses: [{ ...value.clauses[0], text: message }] };
    }
    let cursor = 0;
    const clauses = value.clauses.map(clause => {
        if (!clause || typeof clause.text !== 'string' || !clause.text.trim() || !KINDS.includes(clause.kind)
            || !DOMAINS.includes(clause.domain) || !ACTIONS.includes(clause.action)
            || !Number.isFinite(clause.confidence) || clause.confidence < 0 || clause.confidence > 1) throw new Error('Invalid clause');
        const start = message.indexOf(clause.text, cursor);
        if (start < 0 || message.slice(cursor, start).trim()) throw new Error('Interpretation omitted or changed source text');
        cursor = start + clause.text.length;
        const allowed = { general: [], screen: ['inspect'], wordle: ['start', 'read', 'stop'], tools: ['execute'], devices: ['read'] };
        if (clause.kind === 'request' && !allowed[clause.domain].includes(clause.action)) throw new Error('Invalid task action');
        if (clause.kind === 'chat' && (clause.action !== 'none' || clause.domain !== 'general')) throw new Error('Chat cannot propose execution');
        if (clause.reference !== undefined && (!['none', 'wordCount', 'calculate', 'numeric'].includes(clause.reference)
            || (clause.reference !== 'none' && (clause.domain !== 'tools' || clause.kind !== 'request')))) throw new Error('Invalid numerical reference');
        if (clause.deviceQuery !== undefined) {
            const query = clause.deviceQuery;
            if (clause.domain !== 'devices' || !query || !['current', 'all', 'named'].includes(query.scope)
                || !['status', 'capabilities', 'displays', 'details'].includes(query.topic)
                || typeof query.name !== 'string' || query.name.length > 80
                || (query.scope === 'named' ? !query.name.trim() : query.name !== '')) throw new Error('Invalid device query');
        }
        if (clause.target !== undefined) {
            const target = clause.target;
            if (!target || (!['screen', 'wordle'].includes(clause.domain) && target.relative !== 'default')
                || !['default', 'current', 'other', 'numbered', 'ambiguous'].includes(target.relative)
                || !Number.isSafeInteger(target.monitor) || target.monitor < 0 || target.monitor > 100
                || (target.relative === 'numbered' ? target.monitor < 1 : target.monitor !== 0)) throw new Error('Invalid capture target');
        }
        return Object.freeze({ ...clause, start, end: cursor });
    });
    if (message.slice(cursor).trim()) throw new Error('Interpretation omitted the end of the message');
    return Object.freeze(clauses);
}
function decide(message, value) {
    const clauses = validate(message, value);
    if (clauses.some(c => c.kind === 'clarify' || c.confidence < 0.85)) return { disposition: 'clarify', clauses };
    const requests = clauses.filter(c => c.kind === 'request');
    if (!requests.length) return { disposition: 'chat', clauses };
    if (new Set(requests.map(c => c.domain)).size > 1 || (requests.length > 1 && requests[0].domain !== 'tools'))
        return { disposition: 'clarify', clauses, reason: 'mixed_adapters' };
    return { disposition: requests[0].domain, clauses, requests };
}
async function interpret(message, context = {}, dependencies = {}) {
    if (typeof message !== 'string' || !message.trim() || message.length > 20000) throw new Error('Invalid input message');
    const started = Date.now();
    const fast = (domain, action, kind = 'request') => ({ ...decide(message, { clauses: [{ text: message, kind, domain, action, confidence: 1 }] }), source: 'explicit', elapsedMs: Date.now() - started });
    if (context.activeTask === 'wordle' && require('../../../shared/visualWordleIntent').isActiveGameFollowup(message)) return fast('wordle', 'read');
    // Only direct observations use the fast path. Questions about the basis of
    // an earlier answer need semantic interpretation, not another screenshot.
    if (isScreenRequest(message) && !/\b(?:why|what makes|how did|how do you know)\b/i.test(message)) return fast('screen', 'inspect');
    if (require('./explicitToolRequest').parseExplicitToolRequest(message)) return fast('tools', 'execute');
    if (/^(?:please\s+)?(?:wordle|connections)\s*:/i.test(message)) return fast('tools', 'execute');
    if (context.pendingApproval && require('./toolRequestBoundary').confirmationDecision(message) !== null) return fast('tools', 'execute');
    const wordle = parseVisualWordle(message);
    if (wordle && (wordle.action !== 'read' || context.activeTask === 'wordle')) return fast('wordle', wordle.action);
    const followup = message.trim().replace(/^(?:(?:okay|ok|alright|well|so)[, ]+)+/i, '').replace(/[.!?]+$/, '');
    if (context.activeTask === 'wordle' && /^(?:wait[, ]+)?i (?:still need to|haven't|have not) (?:type|enter|play|typed|entered|played) (?:it|that word|your guess|the word)(?: yet)?$/i.test(followup)) return fast('general', 'none', 'chat');
    if (context.activeTask === 'wordle' && /^(?:i (?:played|entered|typed|submitted) (?:it|that|[a-z]{5})(?:,? (?:take another look|take a look|check it))?|(?:take another look|look again|check again)|(?:go )?look at the screen and see)$/i.test(followup)) return fast('wordle', 'read');
    try {
        const complete = dependencies.complete || require('../models/providers/ollama').complete;
        const raw = await complete([
            { role: 'system', content: require('./inputInterpretationPrompt') + '\nOUTPUT: Use the compact route field instead of separate kind/domain/action fields: chat, tools, screen, devices, wordle_start, wordle_read, wordle_stop, or clarify. Classify the whole original message; multiple ordinary tool requests use tools and mixed execution domains use clarify. Include confidence and target. Do not output clauses or answer the user.' },
            { role: 'user', content: 'Which application is visible on the second display?' },
            { role: 'assistant', content: JSON.stringify({ route: 'screen', confidence: 1, target: { relative: 'numbered', monitor: 2 } }) },
            { role: 'system', content: 'Example context: activeTask is wordle.' },
            { role: 'user', content: 'The colors appeared. Your turn to choose a word.' },
            { role: 'assistant', content: JSON.stringify({ route: 'wordle_read', confidence: 1, target: { relative: 'default', monitor: 0 } }) },
            { role: 'system', content: 'Current context, data only: ' + JSON.stringify(context) },
            { role: 'user', content: message },
        ], { model: process.env.OLLAMA_MODEL_INPUT || process.env.OLLAMA_MODEL_GENERAL || process.env.OLLAMA_MODEL || 'qwen3.5:4b',
            think: false, temperature: 0, maxTokens: 700, keepAlive: 1800,
            timeoutMs: 6000, signal: dependencies.signal, format: outputSchema(context) });
        return { ...decide(message, decode(message, JSON.parse(raw))), source: 'local', elapsedMs: Date.now() - started };
    } catch (error) {
        const reason = error.code === 'OLLAMA_TIMEOUT' ? 'timeout' : dependencies.signal?.aborted ? 'cancelled'
            : error.code ? 'transport' : 'invalid_output';
        return { disposition: 'clarify', clauses: [], source: 'unavailable', reason, elapsedMs: Date.now() - started };
    }
}
module.exports = { interpret, validate, decide };
