const { randomInt } = require('node:crypto');
const vocabulary = require('./wordleVocabulary');

// Familiar five-distinct-letter openers. Variety is confined to empty boards;
// subsequent guesses still come from the checked solver.
const OPENERS = Object.freeze(['SLATE', 'CRANE', 'TRACE', 'STARE', 'RAISE', 'ARISE', 'IRATE', 'ROAST', 'LEAST', 'LATER', 'ALERT', 'STALE']);
function createOpeningPicker(pickIndex = randomInt) {
    const used = new Set();
    let last = null;
    return function pick(game) {
        if (game.rows.length || game.candidates.length) return null;
        const rejected = new Set(game.rejectedCandidates || []);
        const eligible = OPENERS.filter(word => vocabulary.contains(word) && !rejected.has(word));
        if (!eligible.length) return null;
        let available = eligible.filter(word => !used.has(word));
        if (!available.length) {
            used.clear();
            available = eligible;
        }
        if (available.length > 1) available = available.filter(word => word !== last);
        const chosen = available[pickIndex(available.length)];
        used.add(chosen); last = chosen;
        return chosen;
    };
}
module.exports = { OPENERS, createOpeningPicker, pickOpening: createOpeningPicker() };
