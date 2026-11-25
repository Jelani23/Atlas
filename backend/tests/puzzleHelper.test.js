const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wordle-helper-test-'));
process.env.WORDLE_STATE_DIR = directory;
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
const wordle = require('../src/puzzles/wordle');
const connections = require('../src/puzzles/connections');
const pipeline = require('../src/puzzles/puzzlePipeline');
const state = require('../src/planner/state');
const { resolve } = require('../src/intent/intentResolver');
const planner = require('../src/planner/planner');
const { validateToolArguments } = require('../src/tools/toolArguments');
const noModel = async () => { throw new Error('Unexpected model call'); };
const run = message => pipeline.execute(message, { generate: noModel });

async function main() {
    assert.equal(wordle.feedback('ARRAY', 'RIVER'), 'BYYBB');
    assert.equal(wordle.feedback('RERER', 'RIVER'), 'GBBGG');
    assert.equal(wordle.marks('⬛🟨⬜🟩🟩'), 'BYBGG');
    assert.throws(() => wordle.marks('GG'), /five colors/);
    const rows = ['BRAIN', 'CRIME', 'BRIER'].map(guess => ({ guess, marks: wordle.feedback(guess, 'RIVER') }));
    assert(wordle.inspect('RIVER', rows).consistent);
    assert(wordle.inspect('RIDER', rows).consistent);
    assert(!wordle.inspect('FLIER', rows).consistent);
    assert(!wordle.inspect('BRIER', rows).consistent);
    assert.equal(wordle.ledger(rows).minimum.R, 2);
    assert(wordle.isFeasible(rows));
    assert(!wordle.isFeasible([{ guess: 'AAAAA', marks: 'YBBBB' }]));
    assert(!wordle.isFeasible([{ guess: 'AABCD', marks: 'BYBBB' }]));
    assert(!wordle.isFeasible([{ guess: 'RIVER', marks: 'GGGGG' }, { guess: 'RIDER', marks: 'GGGGG' }]));
    assert.deepEqual(wordle.rank(['RIVER', 'RIDER', 'FLIER', 'RIVER'], rows).map(row => row.candidate).sort(), ['RIDER', 'RIVER']);
    assert.equal(wordle.rank(['RIVER'], [{ guess: 'RIVER', marks: 'GGGGG' }]).length, 0);
    // Every real answer remains feasible, including duplicate-heavy feedback.
    for (const answer of ['ABABA', 'AAAAB', 'BBAAA', 'RIVER', 'LEVEL', 'SHEEP']) {
        assert(wordle.isFeasible(['ARRAY', 'LEVEL', 'ABABA'].map(guess => ({ guess, marks: wordle.feedback(guess, answer) }))));
    }
    assert(validateToolArguments('puzzleHelper', ['Wordle: status']));
    assert(!validateToolArguments('puzzleHelper', [{}]));
    for (const request of ['I like Wordle', 'Explain how Connections works', 'Do not solve Wordle', 'Check my database connections']) {
        assert(!pipeline.matchesRequest(request));
        assert.notEqual(resolve(request).winner, 'puzzleHelper');
    }
    await state.runInSession('puzzle-test', async () => {
        assert.equal(resolve('Wordle: new').winner, 'puzzleHelper');
        const result = await planner.route(resolve('Wordle: new'), 'Wordle: new');
        assert.equal(result.toolName, 'puzzleHelper'); assert(result.shortCircuit);
        for (const row of rows) assert(!(await run(`Wordle: ${row.guess} ${row.marks}`)).startsWith('Error:'));
        const snapshot = structuredClone(state.puzzleState);
        assert.match(await run('Wordle: FLIER GGGGG'), /contradict/);
        assert.deepEqual(state.puzzleState, snapshot);
        assert.match(await run('Wordle: BRAIN GGGGG'), /already exists/);
        assert.match(await run('Wordle: correct FLIER BBBBB'), /not been recorded/);
        assert.deepEqual(state.puzzleState, snapshot);
        assert.match(await run('Wordle: check FLIER'), /conflicts/);
        const supplied = await run('Wordle: candidates RIVER, RIDER, FLIER');
        assert.match(supplied, /RIVER/); assert.match(supplied, /RIDER/); assert(!supplied.includes('FLIER'));
        assert.match(supplied, /not an exhaustive/);
        const hint = await run('Wordle: hint');
        assert(hint.includes('___ER')); assert(!hint.includes('RIVER'));
        assert.equal(state.puzzleState.wordle.rows.length, 3);
        const generated = await pipeline.execute('Wordle: suggest', { generate: noModel });
        assert.match(generated, /supplied pool/);
        const untouched = structuredClone(state.puzzleState);
        assert.match(await run('Wordle: candidates RIVER, X'), /five letters/);
        assert.deepEqual(state.puzzleState, untouched);
        await run('Wordle: new');
        const mock = async () => ({ candidates: ['SLATE', 'SLATE', 'a', 42, 'CRANE'] });
        assert.match(await pipeline.execute('Wordle: suggest', { generate: mock }), /SLATE/);
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        assert.match(await pipeline.execute('Wordle: suggest', { generate: async () => ({ candidates: ['xxxxx!'] }) }), /No unplayed candidate/);
        assert.match(await pipeline.execute('Wordle: suggest', { generate: async () => { throw new Error('offline'); } }), /offline/);
        assert.equal(state.puzzleState.wordle.rows.length, 0);
        await run('Wordle: SLATE BBBBB');
        assert.match(await run('Wordle: correct SLATE GGGGG'), /Solved/);
        assert.match(await run('Wordle: suggest'), /already solved/);
        await run('Wordle: new');
        await run('Wordle: SLATE BBBYB');
        let attempts = 0;
        const beforeRepair = structuredClone(state.puzzleState);
        const repaired = await pipeline.execute('Wordle: suggest', { generate: async (kind, snapshot) => {
            assert.equal(kind, 'wordle');
            attempts++;
            if (attempts === 1) return { candidates: ['SLATE', 'TENTS'] };
            assert(snapshot.rejected.every(item => item.conflicts.length > 0));
            return { candidates: ['TRUCK', 'SLATE'] };
        } });
        assert.equal(attempts, 2);
        assert.match(repaired, /TRUCK/); assert(!repaired.includes('SLATE'));
        assert.deepEqual(state.puzzleState, beforeRepair);
        attempts = 0;
        assert.match(await pipeline.execute('Wordle: suggest', { generate: async () => {
            attempts++; return { candidates: ['TENTS'] };
        } }), /No unplayed candidate/);
        assert.equal(attempts, 2);
        assert.deepEqual(state.puzzleState, beforeRepair);
        await run('Wordle: new');
        for (const guess of ['SLATE', 'CRANE', 'BRAIN', 'BRIER', 'FLIER', 'RIDER']) {
            await run(`Wordle: ${guess} ${wordle.feedback(guess, 'RIVER')}`);
        }
        assert.match(await run('Wordle: suggest'), /six Wordle guesses/);
    });
    // Exercise the actual proposal boundary without a live model or network.
    const adapters = require('../src/models/modelAdapter');
    const originalAdapter = adapters.createModelAdapter;
    try {
        adapters.createModelAdapter = provider => {
            assert.equal(provider, 'ollama');
            return { complete: async (messages, options) => {
                assert.equal(options.timeoutMs, 45000);
                assert.equal(options.think, false);
                const pattern = new RegExp(options.format.properties.candidates.items.pattern);
                assert(pattern.test('TRUCK')); assert(!pattern.test('TENTS')); assert(!pattern.test('MIRTH'));
                assert(messages[1].content.includes('Do NOT use these letters anywhere: S, L, A, E'));
                return '{"candidates":["TRUCK"]}';
            } };
        };
        const rows = [{ guess: 'SLATE', marks: 'BBBYB' }];
        assert.deepEqual(await pipeline.propose('wordle', { rows, constraints: wordle.ledger(rows) }), { candidates: ['TRUCK'] });
    } finally { adapters.createModelAdapter = originalAdapter; }
    await state.runInSession('puzzle-other', async () => {
        assert.match(await run('Wordle: status'), /0 recorded/);
        const board = 'RED, BLUE, GREEN, GOLD, CAT, DOG, HORSE, COW';
        const result = await planner.route(resolve(`Connections: new ${board}`), `Connections: new ${board}`);
        assert.equal(result.toolName, 'puzzleHelper'); assert.match(result.toolResult, /8 entries/);
        const game = structuredClone(state.puzzleState.connections);
        assert.match(await run('Connections: new A, A, B, C'), /distinct/);
        assert.deepEqual(state.puzzleState.connections, game);
        const mock = async () => ({ groups: [
            { category: 'Colors', words: ['red', 'blue', 'green', 'gold'] },
            { category: 'Animals', words: ['CAT', 'DOG', 'HORSE', 'COW'] },
            { category: 'Invalid', words: ['RED', 'RED', 'DOG', 'COW'] },
            { category: 'Invented', words: ['RED', 'BLUE', 'GREEN', 'PINK'] }
        ] });
        const suggestion = await pipeline.execute('Connections: suggest', { generate: mock });
        assert.match(suggestion, /Colors/); assert.match(suggestion, /Animals/);
        assert(!suggestion.includes('Invalid')); assert(!suggestion.includes('PINK'));
        assert.match(suggestion, /unverified/);
        assert.deepEqual(state.puzzleState.connections, game);
        assert.match(await run('Connections: one away RED, BLUE, GREEN, CAT'), /Recorded/);
        assert.match(await pipeline.execute('Connections: suggest', { generate: mock }), /Possible grouping/);
        const hint = await pipeline.execute('Connections: hint', { generate: mock });
        assert.match(hint, /Colors/); assert(!hint.includes('RED'));
        assert.match(await run('Connections: rejected RED, BLUE, GREEN, GOLD'), /Recorded/);
        assert.match(await pipeline.execute('Connections: suggest', { generate: mock }), /No checked suggestion/);
        assert.match(await run('Connections: solved RED, BLUE, GREEN, GOLD'), /conflicting feedback/);
        assert.match(await run('Connections: solved CAT, DOG, HORSE, COW'), /4 entries remain/);
        assert.match(await run('Connections: check CAT, DOG, HORSE, COW'), /remaining board/);
        await run('Connections: reset');
        assert.match(await run('Connections: status'), /Connections: new/);
    });
    // Full partition checking also uses previously solved groups for one-away.
    const game = { board: ['A', 'B', 'C', 'D'], solved: [['E', 'F', 'G', 'H']], rejected: [{ words: ['E', 'F', 'G', 'A'], oneAway: true }] };
    const groups = [{ category: 'test', words: ['A', 'B', 'C', 'D'] }];
    assert.equal(connections.partitions(groups, game).length, 1);
    game.rejected = [{ words: ['E', 'F', 'A', 'B'], oneAway: true }];
    assert.equal(connections.partitions(groups, game).length, 0);
    await state.runInSession('puzzle-closing', async () => {
        let finish;
        const pending = pipeline.execute('Wordle: suggest', { generate: () => new Promise(resolve => { finish = resolve; }) });
        assert.match(await run('Wordle: new'), /still running/);
        state.endSession('puzzle-closing');
        finish({ candidates: ['SLATE'] });
        assert.match(await pending, /closed/);
        assert.equal(state.puzzleState, null);
    });
    await state.runInSession('puzzle-closing', async () => assert.equal(state.puzzleState, null));
    for (const id of ['puzzle-test', 'puzzle-other', 'puzzle-closing']) state.endSession(id);
    console.log('puzzleHelper.test.js: constraint checks, hints, model boundaries, routing and session lifecycle passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
