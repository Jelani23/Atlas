const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const wordle = require('./wordle');
let cache;
function words() {
    if (!cache) {
        const source = fs.readFileSync(path.join(__dirname, 'data/words.txt'), 'utf8').replace(/\r\n/g, '\n');
        const meta = require('./data/words.meta.json');
        if (createHash('sha256').update(source).digest('hex') !== meta.sha256) throw new Error('Word list checksum mismatch.');
        cache = new Set(source.trim().split('\n'));
        if (cache.size !== meta.count) throw new Error('Word list count mismatch.');
    }
    return cache;
}
function contains(value) { return typeof value === 'string' && words().has(value.toLowerCase()); }
function shortlist(game, limit = 96) {
    const rejected = new Set(game.rejectedCandidates || []);
    const remaining = (game.candidates.length ? game.candidates : [...words()].map(word => word.toUpperCase()))
        .filter(candidate => contains(candidate) && !rejected.has(candidate)
            && wordle.inspect(candidate, game.rows).consistent && !game.rows.some(row => row.guess === candidate));
    const counts = {};
    for (const candidate of remaining) for (const letter of new Set(candidate)) counts[letter] = (counts[letter] || 0) + 1;
    const score = candidate => [...new Set(candidate)].reduce((sum, letter) => sum + counts[letter], 0);
    remaining.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    return { total: remaining.length, candidates: remaining.slice(0, limit) };
}
module.exports = { contains, shortlist };
