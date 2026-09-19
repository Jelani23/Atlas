// Keep tool-origin evidence separate from assistant-authored conversation.
function capture(route, agentId, now = Date.now()) {
    if (!route.needsTool || !['readCode', 'read_code'].includes(route.toolName)) return null;
    const result = route.codeEvidenceResult ?? route.toolResult;
    if (typeof result !== 'string' || !/^\s*Content of /i.test(result) || /\nError:/i.test(result)) return null;
    const header = result.split('\n', 2)[1]?.match(/^\[Source coverage: (\{.*\})\]$/);
    let coverage = null;
    try {
        const value = header && JSON.parse(header[1]);
        if (value && typeof value.path === 'string' && /^[a-f0-9]{64}$/.test(value.version)
            && Number.isSafeInteger(value.nextLine) && value.nextLine > 0
            && !/\nContent of /.test(result)) coverage = value;
    } catch { /* Legacy and malformed headers cannot authorize continuation. */ }
    // Never retain half of a numbered source line: it could otherwise be
    // mistaken for a complete final line during syntax/citation validation.
    const bounded = result.length > 12000
        ? result.slice(0, Math.max(0, result.lastIndexOf('\n', 12000))) + '\n[evidence excerpt truncated]'
        : result;
    return { agentId, capturedAt: now, toolName: route.toolName, coverage, toolResult:bounded };
}

function followUp(input, evidence, agentId, now = Date.now()) {
    if (!evidence || evidence.agentId !== agentId || now - evidence.capturedAt > 600000) return null;
    if (!isContinuation(input) && !/\b(?:that|this|supplied|previous|above) (?:code|source|file|snippet)\b|\b(?:code|file|source) you (?:just )?read\b/i.test(input)) return null;
    return evidence;
}
function isContinuation(input) {
    return /^(?:please\s+)?(?:read|show)(?: me)? the next (?:page|section)(?: of (?:that|this) (?:code|file))?[.!?]?$/i.test((input || '').trim());
}
module.exports = { capture, followUp, isContinuation };
