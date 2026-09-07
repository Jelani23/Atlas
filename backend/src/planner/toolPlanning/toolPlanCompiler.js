const tools = require('../../tools');
const { resolve } = require('../../intent/intentResolver');
const { getSchemas } = require('../../tools/toolRegistry');
const permissionManager = require('../../permissions/permissionManager');
const { getClauseCandidates, hasExplicitBoundary } = require('./requestSegmenter');

const DEPENDENCY_WORDS = /\b(?:it|that|those|them|same|previous|result|output)\b/i;

function hasUsableParams(params) {
    if (!Array.isArray(params)) return false;
    if (params.length > 20) return false;
    const safeValue = value => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.length <= 20000;
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value === 'boolean') return true;
        return Array.isArray(value) && value.length <= 20 && value.every(safeValue);
    };
    return params.every(safeValue);
}

function getExecutableSchemas() {
    return new Map(getSchemas()
        .filter(schema => tools[schema.name] && typeof tools[schema.name].execute === 'function')
        .map(schema => [schema.name, schema]));
}

function looksLikeRequestClause(clause, schemas = getExecutableSchemas()) {
    const text = String(clause || '').trim().toLowerCase();
    if (!text) return false;
    if (/\?$/.test(text) || /^(?:please\s+)?(?:can|could|would|will)\s+you\b/.test(text)) {
        return true;
    }

    const firstWord = text.replace(/^please\s+/, '').match(/^[a-z]+/)?.[0];
    if (!firstWord) return false;
    for (const schema of schemas.values()) {
        if (schema.triggers.some(trigger => String(trigger).trim().toLowerCase().startsWith(`${firstWord} `) || String(trigger).trim().toLowerCase() === firstWord)) {
            return true;
        }
    }
    return false;
}

function compileCandidate(candidate, resolveIntent = resolve) {
    if (candidate.overflow) return null;
    const schemas = getExecutableSchemas();
    const steps = [];

    for (let index = 0; index < candidate.segments.length; index++) {
        const clause = candidate.segments[index];
        const route = resolveIntent(clause);
        const schema = route.winner ? schemas.get(route.winner) : null;
        const confident = route.state === 'DETERMINISTIC' &&
            route.confidence >= 0.55 && route.margin >= 0.15;

        if (!schema || !confident || !hasUsableParams(route.params || [])) {
            return null;
        }
        if (index > 0 && DEPENDENCY_WORDS.test(clause)) {
            return null;
        }

        const permission = permissionManager.check(route.winner);
        if (candidate.boundary === 'plain_and' && permission.risk !== 'LOW') {
            return null;
        }

        steps.push({
            id: index + 1,
            clause,
            toolName: route.winner,
            args: route.params || [],
            confidence: route.confidence,
            domain: schema.domain,
            risk: permission.risk,
            requiresApproval: permission.requiresApproval,
            source: 'deterministic'
        });
    }

    return {
        kind: 'tool_plan',
        version: 1,
        boundary: candidate.boundary,
        steps
    };
}

function validateSemanticPlan(proposal, segments, resolveIntent = resolve) {
    if (!proposal || !Array.isArray(proposal.steps) || proposal.steps.length !== segments.length) {
        return null;
    }

    const schemas = getExecutableSchemas();
    const steps = [];
    for (let index = 0; index < proposal.steps.length; index++) {
        const proposed = proposal.steps[index];
        const clause = segments[index];
        const schema = schemas.get(proposed.toolName);
        const permission = schema ? permissionManager.check(proposed.toolName) : null;
        const corroboratingRoute = resolveIntent(clause);
        const isCorroborated = corroboratingRoute.state === 'DETERMINISTIC' &&
            corroboratingRoute.winner === proposed.toolName;

        if (!schema || !permission || proposed.confidence < 0.9 || !hasUsableParams(proposed.args)) {
            return null;
        }
        if (permission.risk !== 'LOW' && !isCorroborated) return null;
        if (index > 0 && DEPENDENCY_WORDS.test(clause)) return null;

        steps.push({
            id: index + 1,
            clause,
            toolName: proposed.toolName,
            args: proposed.args,
            confidence: proposed.confidence,
            domain: schema.domain,
            risk: permission.risk,
            requiresApproval: permission.requiresApproval,
            source: 'semantic'
        });
    }

    return { kind: 'tool_plan', version: 1, boundary: 'semantic', steps };
}

async function compileToolPlan(message, { resolveIntent = resolve, semanticPlanner = null } = {}) {
    const candidates = getClauseCandidates(message);
    if (candidates.some(candidate => candidate.overflow)) {
        return {
            status: 'blocked',
            reason: 'The request exceeds the maximum tool plan size.',
            segments: candidates.find(candidate => candidate.overflow).segments
        };
    }
    for (const candidate of candidates) {
        const plan = compileCandidate(candidate, resolveIntent);
        if (plan && plan.steps.length > 1) {
            return { status: 'ready', plan };
        }
    }

    const explicitCandidate = candidates.find(candidate => candidate.boundary === 'explicit');
    const explicitRequestCount = explicitCandidate
        ? explicitCandidate.segments.filter(segment => looksLikeRequestClause(segment)).length
        : 0;
    if (explicitCandidate && explicitRequestCount === explicitCandidate.segments.length && typeof semanticPlanner === 'function') {
        try {
            const proposal = await semanticPlanner({
                message,
                segments: explicitCandidate.segments,
                schemas: [...getExecutableSchemas().values()]
            });
            const plan = validateSemanticPlan(proposal, explicitCandidate.segments, resolveIntent);
            if (plan) return { status: 'ready', plan };
        } catch (error) {
            console.warn(`[Planner] Semantic plan proposal failed: ${error.message}`);
        }
    }

    if (explicitCandidate && explicitRequestCount >= 2 && hasExplicitBoundary(message)) {
        const routedCount = explicitCandidate.segments
            .map(segment => resolveIntent(segment))
            .filter(route => route.state === 'DETERMINISTIC' && route.winner)
            .length;
        if (routedCount > 0) {
            return {
                status: 'blocked',
                reason: 'Not every requested step mapped safely to one tool.',
                segments: explicitCandidate.segments
            };
        }
    }

    const plainCandidate = candidates.find(candidate => candidate.boundary === 'plain_and');
    if (plainCandidate) {
        const routedCount = plainCandidate.segments
            .map(segment => resolveIntent(segment))
            .filter(route => route.state === 'DETERMINISTIC' && route.winner)
            .length;
        if (routedCount === plainCandidate.segments.length) {
            return {
                status: 'blocked',
                reason: 'The request needs an explicit boundary before state-changing tools can be queued.',
                segments: plainCandidate.segments
            };
        }
    }

    return { status: 'none' };
}

module.exports = {
    compileToolPlan,
    compileCandidate,
    validateSemanticPlan,
    getExecutableSchemas,
    looksLikeRequestClause,
    hasUsableParams
};
