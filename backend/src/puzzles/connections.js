function words(value) {
    if (typeof value !== 'string') throw new Error('Provide comma-separated board words.');
    const result = value.split(',').map(item => item.trim().replace(/\s+/g, ' ').toUpperCase());
    if (result.some(item => !item || item.length > 60 || /[\r\n|]/.test(item)) || new Set(result).size !== result.length)
        throw new Error('Board entries must be distinct, nonempty words or phrases (up to 60 characters each).');
    return result;
}
const key = group => JSON.stringify([...group].sort());
function checkGroup(group, game) {
    if (!Array.isArray(group) || group.length !== 4 || group.some(item => typeof item !== 'string')) return 'Use exactly four board entries.';
    if (new Set(group).size !== 4 || group.some(item => !game.board.includes(item))) return 'Use four distinct entries from the remaining board.';
    if (game.rejected.some(entry => key(entry.words) === key(group))) return 'That group was already rejected.';
    return null;
}
function proposals(value, game) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.slice(0, 32).flatMap(group => {
        if (!group || typeof group.category !== 'string' || !group.category.trim() || group.category.length > 120 || /[\r\n]/.test(group.category)) return [];
        if (!Array.isArray(group.words) || group.words.some(item => typeof item !== 'string')) return [];
        const normalized = group.words.map(item => item.trim().replace(/\s+/g, ' ').toUpperCase());
        if (checkGroup(normalized, game) || seen.has(key(normalized))) return [];
        seen.add(key(normalized));
        return [{ category: group.category.trim(), words: normalized }];
    });
}
// Exact cover checks reuse/coverage and observed one-away feedback. It cannot
// prove that an invented category is the puzzle author's intended connection.
function partitions(groups, game) {
    const result = [];
    function visit(remaining, chosen) {
        if (result.length >= 100) return;
        if (!remaining.length) {
            const all = [...chosen, ...game.solved.map(words => ({ words }))];
            if (game.rejected.filter(entry => entry.oneAway).every(entry =>
                all.some(group => group.words.filter(word => entry.words.includes(word)).length === 3))) result.push(chosen);
            return;
        }
        for (const group of groups) {
            if (group.words.includes(remaining[0]) && group.words.every(word => remaining.includes(word)))
                visit(remaining.filter(word => !group.words.includes(word)), [...chosen, group]);
        }
    }
    visit(game.board, []);
    return result;
}
module.exports = { words, key, checkGroup, proposals, partitions };
