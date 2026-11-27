const { formatImmediateToolReply, formatImmediateToolSpeech } = require('./toolResultPresenter');
const STATUSES = new Set(['success', 'failure', 'partial', 'blocked', 'unknown']);
function envelope({ task, status = 'unknown', data = {}, observations = [], warnings = [], errors = [], metadata = {}, display = '', speech = display }) {
    return { version: 1, task: String(task || 'unknown'), status: STATUSES.has(status) ? status : 'unknown',
        data, observations, warnings, errors, metadata, fallback: { display, speech } };
}
function numericFact(task, raw) {
    if (typeof raw !== 'string') return null;
    let match;
    if (task === 'calculate' && (match = raw.match(/^The result of ([0-9+*/().\s-]+) is (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\.$/i)))
        return { kind: 'calculate', expression: match[1], value: match[2] };
    if (task === 'wordCount' && (match = raw.match(/^Word count: (\d+)$/))) return { kind: 'wordCount', value: match[1] };
    return null;
}
function normalizeTool(route) {
    const display = formatImmediateToolReply(route);
    const speech = formatImmediateToolSpeech(route);
    if (route.toolName === 'espnFantasy' && /^(?:ESPN denied access\.|ESPN data could not be fetched|The ESPN request failed or timed out|The ESPN bridge returned an invalid response|Set ESPN_LEAGUE_ID)/.test(String(route.toolResult)))
        return envelope({ task: 'espnFantasy', status: 'failure', display, speech, errors: [display] });
    if (route.toolName === 'espnFantasy' && typeof route.toolResult === 'string'
        && /^(?:ESPN analysis for |Here's the update for )/.test(route.toolResult)
        && !['failed', 'failure', 'partial', 'blocked'].includes(route.status) && !route.failedCount) {
        return envelope({ task: 'espnFantasy', status: 'success', data: { report: route.toolResult },
            display, speech, metadata: { adapter: 'espn-report' } });
    }
    const steps = route.toolName === 'multi_tool' && Array.isArray(route.toolResults) ? route.toolResults
        : [{ toolName: route.toolName, result: route.toolResult, status: route.status }];
    const errors = steps.filter(s => ['failed', 'failure'].includes(s.status) || /^(?:error\b|tool execution failed\b)/i.test(String(s.result || ''))).map(s => String(s.result || 'The task failed.'));
    if (Array.isArray(route.errors)) errors.push(...route.errors);
    const warnings = Array.isArray(route.warnings) ? route.warnings : [];
    const blocked = route.status === 'blocked' || ['permission_request', 'ask_clarification'].includes(route.toolName);
    const facts = steps.map(s => numericFact(s.toolName, s.result));
    const status = blocked ? 'blocked' : ['failed', 'failure'].includes(route.status) ? 'failure'
        : route.status === 'partial' || Number(route.failedCount) > 0 ? 'partial'
        : errors.length ? (errors.length >= steps.length ? 'failure' : 'partial')
        : facts.length && facts.every(Boolean) ? 'success' : 'unknown';
    const statusPrefix = ['failed', 'failure'].includes(route.status) && !/^(?:error\b|tool execution failed\b|I couldn)/i.test(String(display))
        ? 'The task did not complete. ' : route.status === 'partial' ? 'Only part of the request completed. ' : '';
    const numericDisplay = status === 'success' ? facts.map(f => f.kind === 'calculate'
        ? `${f.expression} is ${f.value}.` : `The text has ${f.value} ${f.value === '1' ? 'word' : 'words'}.`).join(' ') : null;
    return envelope({ task: route.toolName, status, data: { facts: facts.filter(Boolean) }, errors, warnings,
        metadata: { adapter: 'legacy-tool', source: route }, display: numericDisplay ?? statusPrefix + display, speech: numericDisplay ?? statusPrefix + speech });
}
function normalizeWordle(result, fallback) {
    if (/^[A-Z]{5}$/.test(result?.guess || '') && /^(?:The board is empty\.|I read:|No new completed|Try \*\*)/.test(fallback || '')) {
        if (result.status === 'suggestion') fallback = result.first
            ? `Let’s start with ${result.guess}. Tell me when you’ve played it.` : `I’d try ${result.guess} next.`;
        if (result.status === 'unchanged') fallback = `The board hasn’t changed yet; ${result.guess} is still the next guess.`;
        if (result.status === 'solved') fallback = `We got it — ${result.guess}!`;
    }
    return envelope({ task: 'wordle', status: result && ['suggestion', 'unchanged', 'solved'].includes(result.status) ? 'success' : 'unknown',
        data: result || {}, display: fallback, metadata: { adapter: 'visual-wordle' } });
}
module.exports = { envelope, normalizeTool, normalizeWordle };
