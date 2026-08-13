// backend/src/voice/tts/phonemeEstimator.js
//
// Produces an approximate ARPAbet phoneme timeline for a chunk of TTS text,
// scaled to that chunk's actual audio duration. Feeds the frontend's
// hybrid lip-sync (renderer/lib/visemes.ts expects exactly this shape:
// { phoneme, start, end }[], seconds relative to the chunk's <audio>
// element).
//
// WHY HEURISTIC AND NOT REAL ALIGNMENT: Kokoro (backend/src/voice/tts/
// providers/kokoro.js) only returns a finished WAV buffer over its Gradio
// API — no phoneme/word timing comes back with it. Getting *true* forced
// alignment would mean adding a whole separate alignment pass (e.g. a
// Python aligner, or a Kokoro variant/flag that emits timing) as an
// external dependency and extra latency on every chunk. This module
// instead does a fast, dependency-free, synchronous English
// grapheme-to-phoneme approximation and distributes those phonemes across
// the chunk's real measured duration (see wavUtils.js) weighted by typical
// relative phoneme length. It will not be phonetically precise, but it's
// close enough to drive believable mouth-shape motion, adds no meaningful
// latency (pure string processing, no I/O), and is trivially swappable for
// a real aligner's output later since it produces the same
// { phoneme, start, end } shape either way.

// Longest-match-first grapheme -> ARPAbet-ish token rules. Case-insensitive;
// matched against lowercased word text.
const DIGRAPH_RULES = [
    ['tch', 'CH'], ['dge', 'JH'],
    ['sh', 'SH'], ['ch', 'CH'], ['th', 'TH'], ['ph', 'F'], ['wh', 'W'],
    ['ng', 'NG'], ['ck', 'K'], ['qu', 'K'],
    ['ee', 'IY'], ['ea', 'IY'], ['oo', 'UW'],
    ['ou', 'AW'], ['ow', 'OW'], ['oy', 'OY'], ['oi', 'OY'],
    ['ai', 'EY'], ['ay', 'EY'], ['ei', 'EY'], ['ey', 'EY'],
    ['ar', 'AA'], ['er', 'ER'], ['ir', 'ER'], ['or', 'AO'], ['ur', 'ER'],
];

const SINGLE_LETTER_MAP = {
    a: 'AE', e: 'EH', i: 'IH', o: 'AO', u: 'AH',
    b: 'B', c: 'K', d: 'D', f: 'F', g: 'G', h: 'HH',
    j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P',
    q: 'K', r: 'R', s: 'S', t: 'T', v: 'V', w: 'W',
    x: 'K', y: 'Y', z: 'Z',
};

// Relative duration weights by phoneme class (unitless — only their ratios
// matter once the whole timeline gets scaled to the real audio duration).
const VOWELS = new Set(['AE', 'EH', 'IH', 'AO', 'AH', 'IY', 'UW', 'AW', 'OW', 'OY', 'EY', 'AA', 'ER']);
const GLIDES = new Set(['W', 'Y']);
const PLOSIVES = new Set(['P', 'B', 'T', 'D', 'K', 'G']);

function weightFor(token) {
    if (VOWELS.has(token)) return 1.3;
    if (GLIDES.has(token)) return 0.75;
    if (PLOSIVES.has(token)) return 0.65;
    return 0.85; // fricatives, nasals, liquids, etc.
}

/** Breaks one lowercased word into a sequence of ARPAbet-ish tokens. */
function wordToPhonemes(word) {
    const tokens = [];
    let i = 0;
    outer: while (i < word.length) {
        for (const [graph, phoneme] of DIGRAPH_RULES) {
            if (word.startsWith(graph, i)) {
                tokens.push(phoneme);
                i += graph.length;
                continue outer;
            }
        }
        const single = SINGLE_LETTER_MAP[word[i]];
        if (single) tokens.push(single);
        i += 1;
    }
    return tokens;
}

/**
 * @param {string} text - the sentence/chunk that was just synthesized.
 * @param {number|null} durationSeconds - real measured duration of the
 *   resulting audio (see wavUtils.getWavDurationSeconds). If null/0, no
 *   timeline is produced (caller falls back to amplitude-only lip-sync).
 * @returns {{phoneme: string, start: number, end: number}[]}
 */
function estimateTimeline(text, durationSeconds) {
    if (!text || !durationSeconds || durationSeconds <= 0) return [];

    // [token, weight] pairs, in order, including SIL gaps for whitespace
    // and punctuation so pauses actually read as closed-mouth moments
    // instead of the last sound smearing across the gap.
    const entries = [];
    const words = text.trim().split(/\s+/).filter(Boolean);

    words.forEach((rawWord, wi) => {
        const lower = rawWord.toLowerCase();
        const clean = lower.replace(/[^a-z]/g, '');
        const phonemes = clean.length > 0 ? wordToPhonemes(clean) : [];

        for (const p of phonemes) entries.push([p, weightFor(p)]);

        // Gap after the word: bigger pause on sentence-ending punctuation,
        // medium on commas/semicolons, small default word gap. Skip the
        // gap after the very last word — nothing to bridge to.
        if (wi < words.length - 1) {
            if (/[.!?]$/.test(rawWord)) entries.push(['SIL', 1.6]);
            else if (/[,;:]$/.test(rawWord)) entries.push(['SIL', 0.9]);
            else entries.push(['SIL', 0.3]);
        }
    });

    if (entries.length === 0) return [];

    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    const scale = durationSeconds / totalWeight;

    const timeline = [];
    let t = 0;
    for (const [phoneme, weight] of entries) {
        const dur = weight * scale;
        timeline.push({ phoneme, start: t, end: t + dur });
        t += dur;
    }
    return timeline;
}

module.exports = { estimateTimeline };
