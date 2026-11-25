// Opt-in live local-model smoke checks; never part of the offline suite.
const assert = require('node:assert/strict');
const model = require('../src/puzzles/wordleInterpreter');
const context = { active: true, board: [{ guess: 'TRAIN', marks: 'BBBBB' }], pendingGuess: 'MOULS', partial: null, recent: [] };
const cases = [
    ['M, u, and s are gray, o is green, and l is yellow.', 'feedback', 'BGBYB'],
    ['All of those letters are gray.', 'feedback', 'BBBBB'],
    ["That word isn't available", 'reject'],
    ['The O landed in the right spot; L is in the word but somewhere else. Everything else is gray.', 'feedback', 'BGBYB'],
    ['Only O is green. I have not told you the other colors yet.', 'feedback', '?G???'],
    ['What should I make for dinner?', 'other'],
    ['Why would yellow mean that?', 'discuss'],
    ['That was correct!', 'feedback', 'GGGGG'],
    ['yellow, yellow, gray, gray, gray', 'feedback', 'YYBBB'],
];
(async () => {
    let failed = 0;
    for (const [message, action, colors] of cases) {
        try {
            const result = await model.interpret(message, context);
            assert.equal(result.action, action);
            if (colors) assert.equal(result.colors.join(''), colors);
            console.log('PASS', message);
        } catch (error) { failed++; console.log('FAIL', message, error.message); }
    }
    const partialContext = { ...context, pendingGuess: 'TOUCH', partial: { guess: 'TOUCH', colors: ['Y', 'Y', null, null, null] }, recent: [
        { role: 'assistant', content: 'What colors are positions 3 (U), 4 (C), 5 (H)?' }
    ] };
    for (const [message, action, colors] of [
        ['those are all gray', 'feedback', '??BBB'],
        ['Which colors are you missing?', 'status'],
        ['Which ones are the remaining rows?', 'status'],
        ['yellow, yello, gray, gray, gray', 'feedback', 'YYBBB']
    ]) {
        try {
            const result = await model.interpret(message, partialContext);
            assert.equal(result.action, action);
            if (colors) assert.equal(result.colors.join(''), colors);
            console.log('PASS partial', message);
        } catch (error) { failed++; console.log('FAIL partial', message, error.message); }
    }
    const fs = require('node:fs'), path = require('node:path');
    const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wordle-live-'));
    process.env.WORDLE_STATE_DIR = directory;
    try {
        const state = require('../src/planner/state');
        const chat = require('../src/puzzles/wordleDialogue');
        await state.runInSession('live', async () => {
            for (const message of ['I want to test Wordle. Give me your first guess.', 'All of those letters are gray.', "That word isn't available"]) {
                console.log('CHAT', message, '=>', await chat.route(message));
            }
            assert.equal(state.puzzleState.wordle.rows[0].marks, 'BBBBB');
            assert.equal(state.puzzleState.wordle.rejectedCandidates.length, 1);
        });
    } catch (error) { failed++; console.log('FAIL full dialogue', error.message); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
    process.exitCode = failed ? 1 : 0;
})();
