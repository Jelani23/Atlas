// Keep tool-origin evidence separate from assistant-authored conversation.
function capture(route, agentId, now = Date.now()) {
    if (!route.needsTool || !['readCode', 'read_code'].includes(route.toolName)) return null;
    const result = route.toolResult;
    if (typeof result !== 'string' || !/^\s*Content of /i.test(result) || /\nError:/i.test(result)) return null;
    return { agentId, capturedAt: now, toolName: route.toolName,
        toolResult: result.slice(0, 12000) + (result.length > 12000 ? '\n[evidence excerpt truncated]' : '') };
}

function followUp(input, evidence, agentId, now = Date.now()) {
    if (!evidence || evidence.agentId !== agentId || now - evidence.capturedAt > 600000) return null;
    if (!/\b(?:that|this|supplied|previous|above) (?:code|source|file|snippet)\b|\b(?:code|file|source) you (?:just )?read\b/i.test(input)) return null;
    return evidence;
}
module.exports = { capture, followUp };
