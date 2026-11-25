const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wordle-chat-test-'));
process.env.WORDLE_STATE_DIR = directory;
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => { throw new Error('No network in conversation tests'); };
const chat = require('../src/puzzles/wordleConversation');
const pipeline = require('../src/puzzles/puzzlePipeline');
const state = require('../src/planner/state');
const wordle = require('../src/puzzles/wordle');
let calls = 0;
const generate = async (_kind, snapshot) => {
    calls++;
    return { candidates: snapshot.rows.length ? ['TRUCK', 'SLATE'] : ['SLATE'] };
};
const say = text => chat.route(text, { generate });

async function main() {
    for (const phrase of ['All of those letters are gray.', 'All those letters are grey.', 'All of the letters are gray.', 'All five letters are gray.']) {
        assert.equal(chat.parseColors(phrase, 'SLATE').colors.join(''), 'BBBBB');
        assert(chat.parseColors(phrase, 'SLATE').complete);
    }
    assert(!chat.parseColors('All of those letters are gray.', 'SLATE', [null, null, null, 'Y', null]).complete);
    await state.runInSession('all-those-letters', async () => {
        await chat.route("Let's play Wordle", { generate: async () => ({ candidates: ['SLATE'] }) });
        const reply = await chat.route('All of those letters are gray.', { generate: async () => ({ candidates: ['SLATE', 'CHUNK'] }) });
        assert.deepEqual(state.puzzleState.wordle.rows, [{ guess: 'SLATE', marks: 'BBBBB' }]);
        assert.match(reply, /CHUNK/);
        assert.equal(state.puzzleConversation.pendingGuess, 'CHUNK');
    });
    const opening = 'Alright Alice, I want to test out the new Wordle integration we added. Can you give me your first guess?';
    assert(chat.startsGame(opening));
    await state.runInSession('reported-wordle-regression', async () => {
        const fake = async (_kind, snapshot) => ({ candidates: snapshot.rows.length ? ['MANGO', 'ALERT', 'SLATE'] : ['RIVER'] });
        assert.match(await chat.route(opening, { generate: fake }), /RIVER/);
        assert.match(await chat.route('RIVER had everything as gray', { generate: fake }), /MANGO/);
        assert.equal(state.puzzleState.wordle.rows[0].marks, 'BBBBB');
        assert.match(await chat.route('I would like you to continue and try to solve it yourself with general wordle strategies', { generate: fake }), /MANGO/);
        assert.match(await chat.route('SLATE has a yellow A', { generate: fake }), /remaining colors/);
        assert.equal(state.puzzleConversation.partial.guess, 'SLATE');
        assert.match(await chat.route('So what is your guess?', { generate: fake }), /remaining colors for SLATE/);
        assert.equal(state.puzzleState.wordle.rows.length, 1);
    });
    for (const text of ["Let's play Wordle", 'Can we play Wordle?', 'Help me with Wordle', 'Wordle']) assert(chat.startsGame(text));
    for (const text of ["I don't want to play Wordle", 'Explain how Wordle works', 'I used to play Wordle', 'I like Wordle', 'What is Wordle?']) {
        assert(!chat.startsGame(text)); assert.equal(await say(text), null);
    }
    for (const text of ['T is yellow and the rest are gray', 'yellow for T, the rest gray',
        'first gray, second gray, third gray, fourth yellow, fifth gray', 'gray, gray, gray, yellow, gray', '⬛⬛⬛🟨⬛']) {
        assert.equal(chat.parseColors(text, 'SLATE').colors.join(''), 'BBBYB', text);
        assert(chat.parseColors(text, 'SLATE').complete);
    }
    assert(!chat.parseColors('R is green, the rest gray', 'RIVER').complete, 'Repeated letters require positions');
    assert(!chat.parseColors('T might be yellow, rest gray', 'SLATE').complete);
    assert(!chat.parseColors('⬛⬛⬛🟨⬛⬛', 'SLATE').complete);
    assert(!chat.parseColors('T is yellow', 'SLATE').complete);
    await state.runInSession('wordle-chat', async () => {
        assert.match(await say("Let's play Wordle"), /\*\*SLATE\*\*/);
        assert.equal(state.puzzleConversation.pendingGuess, 'SLATE');
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        assert.equal(await say('What is the weather today?'), null);
        assert.equal(await say('The sky is gray today'), null);
        assert.equal(await say('😊'), null);
        assert.equal(await say('What does yellow mean?'), null);
        assert.match(chat.contextFor('Explain your guess strategy'), /SLATE/);
        assert.equal(chat.contextFor('What is the weather today?'), '');
        assert.match(await say('T is yellow'), /remaining colors/);
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        assert.match(await say('The rest are gray'), /\*\*TRUCK\*\*/);
        assert.deepEqual(state.puzzleState.wordle.rows, [{ guess: 'SLATE', marks: 'BBBYB' }]);
        const snapshot = structuredClone(state.puzzleState);
        assert.match(await say('Actually it was all green'), /Which five-letter guess/);
        assert.deepEqual(state.puzzleState, snapshot);
        assert.match(await say('For TRUCK, all gray'), /conflict/);
        assert.deepEqual(state.puzzleState, snapshot);
        assert.match(await say('Why that guess?'), /every color/);
        assert.match(await chat.route('Any ideas?', { generate, interpret: async () => 'suggest' }), /TRUCK/);
        assert.equal(await chat.route('Any ideas for dinner?', { generate, interpret: async () => null }), null);
        assert.match(await say('Pause Wordle'), /leave Wordle/);
        assert.equal(await say('all green'), null);
        assert.equal(chat.contextFor('guess'), '');
        assert.match(await say('Resume Wordle'), /TRUCK/);
        assert.match(await say('all green'), /We got it.*TRUCK/);
        assert.equal(state.puzzleState.wordle.rows.length, 2);
        assert.match(await say('new game'), /SLATE/);
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        await say('all gray');
        assert.match(await say('Actually SLATE was all green'), /We got it.*SLATE/);
        assert.equal(state.puzzleState.wordle.rows[0].marks, 'GGGGG');
        await pipeline.execute('Wordle: new');
        assert.equal(state.puzzleConversation, null);
    });
    await state.runInSession('wordle-failure', async () => {
        await say("Let's play Wordle");
        assert.match(await chat.route('T yellow, rest gray', { generate: async () => { throw new Error('offline'); } }), /saved that feedback/);
        assert.equal(state.puzzleState.wordle.rows[0].marks, 'BBBYB');
        assert.equal(state.puzzleConversation.pendingGuess, null);
        assert.match(await say('what next?'), /TRUCK/);
        assert.match(await say("It won't accept that word"), /couldn't find/);
        assert.deepEqual(state.puzzleState.wordle.rejectedCandidates, ['TRUCK']);
        assert.equal(state.puzzleState.wordle.rows.length, 1);
    });
    await state.runInSession('wordle-isolated', async () => {
        assert.equal(await say('all green'), null);
        assert.equal(state.puzzleState, null);
    });
    await state.runInSession('wordle-no-raw-prose', async () => {
        const reply = await chat.route(opening, { generate: async () => 'private scratchpad: try ADORE, no, try ABIDE, no...' });
        assert.match(reply, /couldn't find/);
        assert(!reply.includes('scratchpad') && !reply.includes('ADORE'));
    });
    await state.runInSession('wordle-close', async () => {
        let finish;
        const pending = chat.route("Let's play Wordle", { generate: () => new Promise(resolve => { finish = resolve; }) });
        assert.match(await say('all gray'), /previous puzzle turn/);
        state.endSession('wordle-close'); finish({ candidates: ['SLATE'] });
        assert.equal(await pending, null);
        assert.equal(state.puzzleState, null); assert.equal(state.puzzleConversation, null);
    });
    // Actual planner entry: natural game requests must bypass generic routing.
    const service = require('../src/puzzles/wordleInterpreter');
    const originalSuggest = service.choose;
    const originalInterpret = service.interpret;
    try {
        service.choose = async () => 'SLATE';
        service.interpret = async () => ({ action: 'start' });
        await state.runInSession('wordle-routing', async () => {
            const { route } = require('../src/planner/planner');
            const { resolve } = require('../src/intent/intentResolver');
            const text = opening;
            const response = await route(resolve(text), text);
            assert.equal(response.toolName, 'puzzleHelper'); assert(response.shortCircuit);
            assert.match(response.toolResult, /SLATE/);
        });
    } finally { service.choose = originalSuggest; service.interpret = originalInterpret; }
    assert(calls > 0);
    for (const id of ['wordle-chat', 'wordle-failure', 'wordle-isolated', 'wordle-close', 'wordle-routing']) state.endSession(id);
    console.log('wordleConversation.test.js: natural turns, feedback attribution, partial clues, corrections, isolation and routing passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
