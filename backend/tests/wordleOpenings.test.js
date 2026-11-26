const assert = require('node:assert/strict');
const { OPENERS, createOpeningPicker } = require('../src/puzzles/wordleOpenings');
const { handle, suggest } = require('../src/puzzles/visualWordle');
const vocabulary = require('../src/puzzles/wordleVocabulary');
const fresh = () => ({ rows: [], candidates: [], rejectedCandidates: [] });
(async () => {
    const pick = createOpeningPicker(() => 0);
    const cycle = OPENERS.map(() => pick(fresh()));
    assert.equal(new Set(cycle).size, OPENERS.length);
    for (const word of cycle) { assert(vocabulary.contains(word)); assert.equal(new Set(word).size, 5); }
    assert.notEqual(pick(fresh()), cycle.at(-1));
    assert.equal(pick({ ...fresh(), rows: [{ guess: 'SLATE', marks: 'BBBBB' }] }), null);
    assert.equal(pick({ ...fresh(), candidates: ['CRANE'] }), null);
    assert.equal(pick({ ...fresh(), rejectedCandidates: [...OPENERS] }), null);
    assert.equal(pick({ ...fresh(), rejectedCandidates: OPENERS.filter(word => word !== 'CRANE') }), 'CRANE');
    const lastFirst = createOpeningPicker(n => n - 1);
    let last;
    for (let i = 0; i < OPENERS.length * 2; i++) { const word = lastFirst(fresh()); assert.notEqual(word, last); last = word; }
    // Actual visual flow: another empty screenshot keeps the pending opener;
    // starting the next game chooses a different one.
    const scope = {};
    const options = { scope, capture: { displayId: '2' }, interaction: { connectionId: 'test' } };
    const deps = { permission: () => ({ allowed: true }), extract: async () => ({ status: 'clear', rows: [] }), checkpoint() {} };
    await handle('start Wordle', options, deps);
    const first = scope.puzzleConversation.pendingGuess;
    assert(OPENERS.includes(first));
    await handle('done', options, deps);
    assert.equal(scope.puzzleConversation.pendingGuess, first);
    await handle('start Wordle', options, deps);
    assert.notEqual(scope.puzzleConversation.pendingGuess, first);
    assert.equal(suggest({ ...fresh(), candidates: ['CRANE'] }), 'CRANE');
    console.log('wordleOpenings: variety, cycle boundaries, vocabulary, exclusions, supplied pools and stable pending guesses passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
