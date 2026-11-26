// Parse explicit observation requests before model routing, for typed and STT text.
function parseScreenRequest(text) {
    let value = String(text).trim().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ')
        .replace(/^(?:(?:um|uh|alright|all right|okay|ok|so|well|then|now|and)[,!]?\s+)+/i, '')
        .replace(/[?.!]+$/g, '').trim();
    const target = '(?:(?:my|the|this)\\s+)?(?:(?:other|first|second|third|fourth)\\s+)?(?:screen|monitor|display)(?:\\s+(?:number\\s+)?(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten))?';
    const prefix = "(?:(?:hey\\s+)?alice[,!]?\\s+)?(?:please\\s+)?(?:(?:can|could|would|will) you\\s+)?(?:please\\s+)?";
    const action = `(?:describe|look at|check|check out|inspect|analyze|analyse|view|show me) ${target}`;
    const question = `(?:(?:tell me|show me) )?what(?:'s| is| do you see) (?:currently )?(?:(?:going on|happening|visible|displayed|showing|shown) )?(?:on|in) ${target}`;
    const screenshot = `(?:take|capture|grab) (?:a |an |another |a new |a fresh )?screenshot(?: (?:of|on) ${target})?`;
    const followup = `what about (?:on |in )?${target}`;
    const suffix = `(?: (?:on|of) ${target})?(?: (?:for me|please|right now|now|then))*`;
    const request = new RegExp(`^${prefix}(?:${action}|${question}|${screenshot}|${followup})${suffix}$`, 'i');
    if (!request.test(value)) {
        // A conversational statement may precede an explicit final request.
        // Parse only that clause so earlier monitor mentions do not retarget it.
        // Do not fish commands out of quotations, examples or conditional speech.
        const boundary = Math.max(...[...value.matchAll(/[,.;!]\s+/g)].map(match => match.index), -1);
        if (boundary < 0 || /["“”`]/.test(value)) return null;
        const preamble = value.slice(0, boundary), trailing = value.slice(boundary + 1).trim();
        if (/\b(?:if|unless|whether|hypothetical|example|quote|quoted|said|saying|asked|asking|ask|say|don't|do not|never|not yet|delete|send|execute|run|install|write|capture|screenshot)\b/i.test(preamble)
            || request.test(preamble) || !/^(?:(?:hey\s+)?alice[,!]?\s+)?(?:please\s+)?(?:can|could|would|will) you\b/i.test(trailing)
            || !request.test(trailing)) return null;
        value = trailing;
    }
    const words = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, first:1, second:2, third:3, fourth:4 };
    const matches = [...value.matchAll(/(?:screen|monitor|display)\s+(?:number\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(first|second|third|fourth)\s+(?:screen|monitor|display)/gi)];
    const numbers = matches.map(m => words[(m[1] || m[2]).toLowerCase()] ?? Number(m[1]));
    if (new Set(numbers).size > 1) return null;
    const relative = /\bother (?:screen|monitor|display)\b/i.test(value) ? 'other'
        : /\b(?:this|my|the) (?:screen|monitor|display)\b/i.test(value) ? 'current' : null;
    if (relative === 'other' && numbers.length) return null;
    return { monitorNumber: numbers[0] ?? null, relative };
}
function isScreenRequest(text) { return parseScreenRequest(text) !== null; }

module.exports = { parseScreenRequest, isScreenRequest };
