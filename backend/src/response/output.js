// Generated prose only. Do not apply this to verbatim source-code/file output.
function cleanGenerated(text) {
    return require('./processor').removeThinkingTraces(String(text || ''))
        .replace(/^\s*(?:final response|final answer)\s*:\s*/i, '').trim();
}
module.exports = { cleanGenerated };
