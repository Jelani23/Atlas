const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wordle-save-test-'));
process.env.WORDLE_STATE_DIR = directory;
const store = require('../src/puzzles/wordleStore');
const state = require('../src/planner/state');
const chat = require('../src/puzzles/wordleConversation');
const generate = async (_kind, snapshot) => ({ candidates: snapshot.rows.length ? ['TRUCK'] : ['SLATE'] });
const ask = (id, message) => state.runInSession(id, () => chat.route(message, { generate }));
async function main() {
    assert.match(await ask('first', "Let's play Wordle"), /SLATE/);
    assert.equal(JSON.parse(fs.readFileSync(store.filename('first'), 'utf8')).conversation.pendingGuess, 'SLATE');
    // A fresh Node process has no chat history and no in-memory session state.
    const child = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const state = require('./backend/src/planner/state');
        const chat = require('./backend/src/puzzles/wordleConversation');
        state.runInSession('first', async () => {
            const reply = await chat.route('T is yellow, the rest gray', { generate: async () => ({ candidates: ['TRUCK'] }) });
            assert.match(reply, /TRUCK/);
            assert.deepEqual(state.puzzleState.wordle.rows, [{guess:'SLATE',marks:'BBBYB'}]);
        }).catch(e => { console.error(e); process.exitCode = 1; });
    `], { cwd: path.join(__dirname, '../..'), env: process.env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    state.endSession('first');
    assert.match(await ask('first', 'Why that guess?'), /need T/);
    assert.match(await ask('second', "Let's play Wordle"), /SLATE/);
    assert.notEqual(store.filename('first'), store.filename('second'));
    assert.equal(path.dirname(store.filename('../../escape')), directory);
    assert.match(await ask('first', 'new game'), /SLATE/);
    const fresh = JSON.parse(fs.readFileSync(store.filename('first'), 'utf8'));
    assert.deepEqual(fresh.game.rows, []);
    assert.equal(JSON.parse(fs.readFileSync(store.filename('second'), 'utf8')).conversation.pendingGuess, 'SLATE');
    await ask('first', 'T is yellow');
    state.endSession('first');
    assert.match(await ask('first', 'rest gray'), /TRUCK/);
    // Failed generation still leaves the complete observed row checkpointed.
    await state.runInSession('failure', async () => {
        await chat.route("Let's play Wordle", { generate });
        assert.match(await chat.route('all gray', { generate: async () => { throw new Error('offline'); } }), /saved/);
    });
    assert.equal(JSON.parse(fs.readFileSync(store.filename('failure'), 'utf8')).game.rows[0].marks, 'BBBBB');
    fs.writeFileSync(store.filename('corrupt'), '{broken');
    assert.match(await ask('corrupt', 'all gray'), /could not read/);
    assert.match(await ask('corrupt', 'new game'), /starting fresh/);
    store.validate(JSON.parse(fs.readFileSync(store.filename('corrupt'), 'utf8')));
    const invalid = structuredClone(fresh);
    invalid.game.rows = [{ guess: 'RIVER', marks: 'GGGGG' }, { guess: 'SLATE', marks: 'GGGGG' }];
    assert.throws(() => store.validate(invalid), /conflict/);
    await state.runInSession('closing', async () => {
        let finish;
        const pending = chat.route("Let's play Wordle", { generate: () => new Promise(resolve => { finish = resolve; }) });
        const before = fs.readFileSync(store.filename('closing'), 'utf8');
        state.endSession('closing'); finish({ candidates: ['SLATE'] });
        assert.equal(await pending, null);
        assert.equal(fs.readFileSync(store.filename('closing'), 'utf8'), before);
    });
    store.remove('second');
    assert(!fs.existsSync(store.filename('second')));
    assert(fs.existsSync(store.filename('first')));
    assert(!fs.readdirSync(directory).some(name => name.endsWith('.tmp')));
    const blocked = path.join(directory, 'not-a-directory');
    fs.writeFileSync(blocked, 'occupied');
    process.env.WORDLE_STATE_DIR = blocked;
    assert.match(await ask('disk-failure', "Let's play Wordle"), /could not save it to disk/);
    assert.match(await ask('disk-failure', 'T yellow, rest gray'), /TRUCK/);
    await state.runInSession('disk-failure', async () => assert.equal(state.puzzleState.wordle.rows[0].marks, 'BBBYB'));
    process.env.WORDLE_STATE_DIR = directory;
    console.log('wordleStore.test.js: restart, replacement, isolation, partial clues, corruption, generation failure and late writes passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
