// A bounded arithmetic input normalizer, not a general STT correction system.
// Unknown wording is rejected rather than stripped into a different calculation.
const SMALL = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function underHundred(words) {
    if (words.length === 1 && SMALL.includes(words[0])) return SMALL.indexOf(words[0]);
    if (!Object.hasOwn(TENS, words[0])) return null;
    if (words.length === 1) return TENS[words[0]];
    const ones = SMALL.indexOf(words[1]);
    return words.length === 2 && ones > 0 && ones < 10 ? TENS[words[0]] + ones : null;
}

function spokenInteger(phrase) {
    const words = phrase.trim().split(/\s+/);
    const negative = words[0] === 'negative';
    if (negative) words.shift();
    let value;
    if (words[1] === 'hundred') {
        const hundreds = SMALL.indexOf(words[0]);
        if (hundreds < 1 || hundreds > 9) return null;
        const rest = words.slice(2);
        if (rest[0] === 'and') {
            rest.shift();
            if (!rest.length) return null;
        }
        const tail = rest.length ? underHundred(rest) : 0;
        if (tail === null) return null;
        value = hundreds * 100 + tail;
    } else {
        value = underHundred(words);
    }
    return value === null ? null : negative ? -value : value;
}

function normalizeArithmeticExpression(input) {
    if (typeof input !== 'string' || input.length > 20000) return null;
    let expression = input.toLowerCase().trim()
        .replace(/\b(multiplied by|times)\b/g, '*')
        .replace(/\bdivided by\b/g, '/')
        .replace(/\bplus\b/g, '+')
        .replace(/\bminus\b/g, '-');
    // Hyphenated tens are number words, not subtraction (twenty-one).
    expression = expression.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/g, '$1 $2');
    if (/\d[a-z]|[a-z]\d/.test(expression)) return null;
    let invalid = false;
    expression = expression.replace(/[a-z]+(?:\s+[a-z]+)*/g, phrase => {
        const value = spokenInteger(phrase);
        if (value === null) { invalid = true; return phrase; }
        return String(value);
    });
    if (invalid || !/\d/.test(expression) || !/^[0-9+\-*/().\s]+$/.test(expression)) return null;
    return expression.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeArithmeticExpression };
