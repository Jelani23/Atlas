// Production checks use only recorded feedback; no answer list or daily lookup.
function word(value) {
    if (typeof value !== 'string' || !/^[a-z]{5}$/i.test(value.trim())) throw new Error('Use exactly five letters per Wordle word.');
    return value.trim().toUpperCase();
}
function marks(value) {
    const normalized = String(value).toUpperCase().replace(/🟩/gu, 'G').replace(/🟨/gu, 'Y')
        .replace(/[⬛⬜]/gu, 'B').replace(/[\s\uFE0F]/g, '');
    if (!/^[GYB]{5}$/.test(normalized)) throw new Error('Use five colors: G = green, Y = yellow, B = gray, or square emoji.');
    return normalized;
}
function feedback(guess, answer) {
    guess = word(guess); answer = word(answer);
    const result = Array(5).fill('B'), remaining = {};
    for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) result[i] = 'G';
        else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
        if (result[i] !== 'G' && remaining[guess[i]] > 0) {
            result[i] = 'Y'; remaining[guess[i]]--;
        }
    }
    return result.join('');
}
function inspect(candidate, rows) {
    candidate = word(candidate);
    const conflicts = rows.filter(row => feedback(row.guess, candidate) !== row.marks)
        .map(row => `${row.guess}: recorded ${row.marks}, but ${candidate} would give ${feedback(row.guess, candidate)}`);
    return { candidate, consistent: !conflicts.length, played: rows.some(row => row.guess === candidate), conflicts };
}
function ledger(rows) {
    const fixed = Array(5).fill(null), excluded = Array.from({ length: 5 }, () => new Set());
    const minimum = {}, maximum = {};
    let conflict = false;
    for (const row of rows) {
        const present = {}, gray = new Set();
        [...row.guess].forEach((letter, i) => {
            if (row.marks[i] === 'G') {
                if (fixed[i] && fixed[i] !== letter) conflict = true;
                fixed[i] = letter;
            } else excluded[i].add(letter);
            if (row.marks[i] === 'B') gray.add(letter);
            else present[letter] = (present[letter] || 0) + 1;
        });
        for (const letter of new Set(row.guess)) {
            minimum[letter] = Math.max(minimum[letter] || 0, present[letter] || 0);
            if (gray.has(letter)) maximum[letter] = Math.min(maximum[letter] ?? 5, present[letter] || 0);
        }
    }
    return { fixed, excluded: excluded.map(set => [...set].sort()), minimum, maximum, conflict };
}
// Feasibility over letter strings, not a dictionary. Unseen letters are
// interchangeable, so one representative is sufficient for this search.
function isFeasible(rows) {
    const rules = ledger(rows);
    if (rules.conflict) return false;
    const seen = new Set(rows.flatMap(row => [...row.guess]));
    const unseen = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(letter => !seen.has(letter));
    const letters = [...seen, ...(unseen ? [unseen] : [])];
    const options = rules.fixed.map((fixed, i) => (fixed ? [fixed] : letters)
        .filter(letter => !rules.excluded[i].includes(letter) && (rules.maximum[letter] ?? 5) > 0));
    const counts = {}, candidate = [];
    function visit(i) {
        if (Object.entries(rules.minimum).some(([letter, count]) => (counts[letter] || 0) +
            options.slice(i).filter(list => list.includes(letter)).length < count)) return false;
        if (i === 5) return rows.every(row => feedback(row.guess, candidate.join('')) === row.marks);
        for (const letter of options[i]) {
            if ((counts[letter] || 0) >= (rules.maximum[letter] ?? 5)) continue;
            counts[letter] = (counts[letter] || 0) + 1; candidate[i] = letter;
            if (visit(i + 1)) return true;
            counts[letter]--;
        }
        return false;
    }
    return visit(0);
}
function rank(candidates, rows) {
    const remaining = [...new Set(candidates.map(word))].filter(candidate => inspect(candidate, rows).consistent);
    return remaining.filter(candidate => !inspect(candidate, rows).played).map(candidate => {
        const buckets = new Map();
        for (const answer of remaining) {
            const key = feedback(candidate, answer);
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const entropy = [...buckets.values()].reduce((sum, count) => {
            const p = count / remaining.length;
            return sum - p * Math.log2(p);
        }, 0);
        return { candidate, entropy };
    }).sort((a, b) => b.entropy - a.entropy || a.candidate.localeCompare(b.candidate));
}
module.exports = { word, marks, feedback, inspect, ledger, isFeasible, rank };
