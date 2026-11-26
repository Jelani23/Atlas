// Explicit, bounded capture triggers shared by Electron and the backend.
function parseVisualWordle(text) {
    const value = String(text).trim().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
        .replace(/^(?:(?:alright|okay|ok|well|so)[, ]+)+/i, '')
        .replace(/\b(?:another|a new|one more) game of wordle\b/i, 'wordle');
    if (/^(?:please\s+)?(?:stop|pause|quit|exit|cancel) (?:visual )?wordle$/i.test(value)) return { action: 'stop' };
    if (/^(?:done|ready|next|check wordle|check the board|i entered it|i typed it)$/i.test(value)) return { action: 'read' };
    const match = value.match(/^(?:(?:alice[, ]+)?(?:please )?)(?:(?:let's |lets )?play|start|help me (?:play|with)) (?:a new |new |visual )?wordle(?: on (?:(?:my |the )?(?:monitor|screen|display) (\d+|one|two|three|four)|(?:my |the )?(other|this|current) (?:monitor|screen|display)|(?:my|the) (?:monitor|screen|display)))?$/i);
    if (!match) return null;
    return { action: 'start', monitor: match[1] ? ({ one: 1, two: 2, three: 3, four: 4 }[match[1].toLowerCase()] ?? Number(match[1])) : null,
        ...(match[2] ? { relative: match[2].toLowerCase() === 'other' ? 'other' : 'current' } : {}) };
}
module.exports = { parseVisualWordle };
