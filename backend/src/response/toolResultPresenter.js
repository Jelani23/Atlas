// Presentation only: keep the original tool records as evidence. Known utility
// outputs can become natural sentences without another model call or recomputing.
function toolLabel(name) {
    return String(name || 'tool').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

function textSubject(args) {
    const text = args?.[0];
    return typeof text === 'string' && text.length > 0 && text.length <= 80 && !/[\r\n]/.test(text)
        ? `“${text}”` : 'The text';
}

function trimDecimalZeros(value) {
    return value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
}

function failed(step) {
    return step.status === 'failed' || /^(?:error\b|tool execution failed:)/i.test(String(step.result || '').trim());
}

function presentResult(step) {
    const raw = typeof step.result === 'string' ? step.result : String(step.result ?? '');
    if (failed(step)) return `I couldn’t complete the ${toolLabel(step.toolName)} request. ${raw}`;
    let match;
    if (step.toolName === 'calculate' && (match = raw.match(/^The result of ([^\r\n]+) is ([^\r\n]+)\.$/))) {
        return `${match[1]} is ${match[2]}.`;
    }
    if (step.toolName === 'wordCount' && (match = raw.match(/^Word count: (\d+)$/))) {
        return `${textSubject(step.args)} has ${match[1]} ${match[1] === '1' ? 'word' : 'words'}.`;
    }
    if (step.toolName === 'characterCount' && (match = raw.match(/^Character count \(with spaces\): (\d+)\r?\nCharacter count \(without spaces\): (\d+)$/))) {
        return match[1] === match[2]
            ? `${textSubject(step.args)} has ${match[1]} ${match[1] === '1' ? 'character' : 'characters'}.`
            : `${textSubject(step.args)} has ${match[1]} characters including spaces, or ${match[2]} without.`;
    }
    if (step.toolName === 'convertUnit' && (match = raw.match(/^(-?\d+(?:\.\d+)?) ([^\r\n]+) is equal to (-?\d+(?:\.\d+)?) ([^\r\n]+)\.$/))) {
        return `${match[1]} ${match[2]} comes to ${trimDecimalZeros(match[3])} ${match[4]}.`;
    }
    // Unrecognized formats, code, documents and detailed reports stay verbatim.
    return raw;
}

function formatImmediateToolReply(toolResult) {
    if (toolResult.toolName !== 'multi_tool' || !Array.isArray(toolResult.toolResults) || !toolResult.toolResults.length) {
        return toolResult.toolResult;
    }
    const steps = toolResult.toolResults;
    const failures = steps.filter(failed).length;
    const intro = failures === steps.length
        ? 'I couldn’t complete those requests.'
        : failures > 0 ? 'I got part of that done.' : 'Here you go.';
    const sentences = steps.map(presentResult);
    const separator = sentences.some(sentence => /[\r\n]/.test(sentence)) ? '\n\n' : ' ';
    return [intro, ...sentences].join(separator);
}

module.exports = { formatImmediateToolReply, presentResult };
