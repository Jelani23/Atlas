const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wordle-dialogue-'));
process.env.WORDLE_STATE_DIR = directory;
const state = require('../src/planner/state');
const chat = require('../src/puzzles/wordleDialogue');
const vocabulary = require('../src/puzzles/wordleVocabulary');
const store = require('../src/puzzles/wordleStore');
const wordle = require('../src/puzzles/wordle');
const { normalize, orderedColors } = require('../src/puzzles/wordleInterpreter');
const proposal = (action, colors = '?????', evidence = '', guess = '') => ({ action, guess,
    colors: [...colors], evidence: [...colors].map(c => c === '?' ? '' : evidence) });
async function main() {
    assert(!vocabulary.contains('LOLVE'));
    assert.deepEqual(orderedColors('yellow, yello, gray, gray, gray'), [...'YYBBB']);
    assert.equal(orderedColors('yellow, unknown, gray, gray, gray'), null);
    assert.equal(orderedColors('not green, yellow, gray, gray, gray'), null);
    const observed = 'O green, L yellow, rest gray';
    const extracted = normalize({ action: 'feedback', guess: '', observations: [
        { target: 'rest', color: 'gray', evidence: observed },
        { target: 'O', color: 'green', evidence: observed },
        { target: 'L', color: 'yellow', evidence: observed }
    ] }, observed, { pendingGuess: 'MOULS' });
    assert.equal(extracted.colors.join(''), 'BGBYB');
    assert.equal(normalize({ action: 'feedback', guess: '', observations: [
        { target: 'E', color: 'green', evidence: 'E green' }
    ] }, 'E green', { pendingGuess: 'LEVEL' }).colors.join(''), '?????');
    assert.throws(() => normalize({ action: 'feedback', guess: '', observations: [
        { target: 'O', color: 'green', evidence: 'invented' }
    ] }, 'O green', { pendingGuess: 'MOULS' }), /Ungrounded/);
    await state.runInSession('dialogue', async () => {
        const ask = (message, parsed, choose = async words => words[0]) => chat.route(message, { interpret: async (_message, context) => {
            assert.equal(_message, message); assert(Array.isArray(context.board)); return parsed;
        }, choose });
        await ask('Can we have a go at Wordle?', proposal('start'));
        // Recreate the actual board from the user report, including a legacy pending word.
        state.puzzleState.wordle.rows = [{ guess: 'TRAIN', marks: 'BBBBB' }];
        state.puzzleConversation.pendingGuess = 'MOULS';
        const message = 'M, u, and s are gray, o is green, and l is yellow.';
        const reply = await ask(message, proposal('feedback', 'BGBYB', message), async () => 'LOLVE');
        assert(!reply.includes('LOLVE'));
        assert.deepEqual(state.puzzleState.wordle.rows[1], { guess: 'MOULS', marks: 'BGBYB' });
        const next = state.puzzleConversation.pendingGuess;
        assert(vocabulary.contains(next)); assert(wordle.inspect(next, state.puzzleState.wordle.rows).consistent);
        await ask("That word isn't available", proposal('reject'));
        assert(state.puzzleState.wordle.rejectedCandidates.includes(next));
        assert.notEqual(state.puzzleConversation.pendingGuess, next);
        assert.equal(state.puzzleState.wordle.rows.length, 2);
        const before = JSON.stringify(state.puzzleState);
        await ask('Maybe?', proposal('feedback', 'BBBBB', 'invented evidence'));
        assert.equal(JSON.stringify(state.puzzleState), before);
        assert.equal(await ask('What is for dinner?', proposal('other')), null);
        assert.equal(await chat.route('Why yellow?', { interpret: async () => proposal('discuss'), discuss: async () => 'Yellow means present elsewhere.' }), 'Yellow means present elsewhere.');
        assert.equal(JSON.parse(fs.readFileSync(store.filename('dialogue'))).game.rows.length, 2);
    });
    state.endSession('dialogue');
    await state.runInSession('dialogue', async () => {
        await chat.route('Where were we?', { interpret: async (_message, context) => {
            assert.equal(context.board.length, 2); assert(context.pendingGuess); return proposal('discuss');
        }, discuss: async () => 'We have two rows saved.' });
    });
    await state.runInSession('partial', async () => {
        await chat.route('Wordle please', { interpret: async () => proposal('new'), choose: async () => 'SLATE' });
        await chat.route('T is yellow', { interpret: async () => proposal('feedback', '???Y?', 'T is yellow') });
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        assert.deepEqual(state.puzzleConversation.partial.colors, [null, null, null, 'Y', null]);
        const status = await chat.route('Which colors are missing?', { interpret: async () => proposal('status'), discuss: async () => { throw new Error('Status must not be generated'); } });
        assert.match(status, /1 \(S\), 2 \(L\), 3 \(A\), 5 \(E\)/);
        await chat.route('the others are gray', { interpret: async () => proposal('feedback', 'BBB?B', 'the others are gray'), choose: async words => words[0] });
        assert.equal(state.puzzleState.wordle.rows[0].marks, 'BBBYB');
    });
    await state.runInSession('solved', async () => {
        state.puzzleConversation = { active: true, pendingGuess: 'IDIOT', partial: null };
        state.puzzleState = { wordle: { rows: [], candidates: [], rejectedCandidates: [] } };
        const reply = await chat.route('That was correct!', { interpret: async () => ({ ...proposal('feedback', 'GGGGG', 'That was correct!'), confirmedSolved: true }) });
        assert.match(reply, /We got it/);
        assert.equal(state.puzzleState.wordle.rows[0].marks, 'GGGGG');
    });
    assert.throws(() => chat.feedback(proposal('feedback', '?G?G?', 'E is green'), 'E is green', { rows: [] }, { pendingGuess: 'LEVEL' }), /more than one/);
    assert.throws(() => chat.feedback(proposal('feedback', 'BBBBB', 'all gray', 'TRAIN'), 'all gray', { rows: [] }, { pendingGuess: 'MOULS' }), /Which guess/);
    console.log('wordleDialogue.test.js: semantic turn validation, vocabulary, rejection, partial feedback and persistence passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
