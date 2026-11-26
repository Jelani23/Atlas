const assert = require('node:assert/strict');
const { parseVisualWordle } = require('../../shared/visualWordleIntent');
const { handle, validateBoard, suggest, extract, parseReading } = require('../src/puzzles/visualWordle');
const wordle = require('../src/puzzles/wordle');
const vocabulary = require('../src/puzzles/wordleVocabulary');
const clear = rows => ({ status: 'clear', rows });
async function main() {
    assert.deepEqual(parseVisualWordle('Alice, help me play Wordle on monitor 2!'), { action: 'start', monitor: 2 });
    assert.equal(parseVisualWordle('I read about Wordle yesterday'), null);
    assert.equal(parseVisualWordle('Wordle: new'), null);
    assert.equal(parseVisualWordle('done').action, 'read');
    assert.deepEqual(parseVisualWordle('Lets play wordle on my other monitor'), { action: 'start', monitor: null, relative: 'other' });
    assert.deepEqual(parseVisualWordle('Let’s play Wordle on this screen'), { action: 'start', monitor: null, relative: 'current' });
    const extracted = await extract({ data: 'fixture', displayId: '2' }, 'fixture', { prepare: async () => ({ data: 'cropped', marks: ['BBGBG'] }), complete: async (messages, options) => {
        assert.deepEqual(messages[1].images, ['cropped']);
        assert.equal(options.format, undefined);
        return 'SLATE';
    } });
    assert.deepEqual(extracted.rows, [{ guess: 'SLATE', marks: 'BBGBG' }]);
    assert.deepEqual(parseReading('Empty Wordle grid; no submitted rows.'), { status: 'clear', reason: 'none', rows: [] });
    assert.equal(parseReading('SLATE: gray, gray, green'), null);
    assert.equal(parseReading('Maybe SLATE: gray, gray, green, gray, green'), null);
    const actualReading = 'TARE S: gray, gray, gray, gray, yellow\nSOILY: green, gray, green, gray, green';
    assert.equal(parseReading(actualReading).rows[0].guess, 'TARES');
    assert.equal(parseReading('T A R E S: gray, gray, gray, gray, yellow').rows[0].guess, 'TARES');
    assert.equal(parseReading('TAR S: gray, gray, gray, gray, yellow'), null);
    assert.equal(parseReading('TARES X: gray, gray, gray, gray, yellow'), null);
    assert.equal(parseReading('TARE S: gray, gray, unclear, gray, yellow'), null);
    let extractionCalls = 0;
    const actualBoard = await extract({ data: 'fixture' }, 'spacing-regression', { prepare: async () => ({ data: 'cropped', marks: ['BBBBY', 'GBGBG'] }), complete: async () => {
        extractionCalls++;
        return 'TARE S\nSOILY';
    } });
    assert.equal(extractionCalls, 1, 'Tile spacing must not require an LLM conversion');
    assert.deepEqual(validateBoard(actualBoard, [{ guess: 'TARES', marks: 'BBBBY' }]), [
        { guess: 'TARES', marks: 'BBBBY' }, { guess: 'SOILY', marks: 'GBGBG' },
    ]);
    const prior = [{ guess: 'TARES', marks: 'BBBBY' }, { guess: 'SOILY', marks: 'GBGBG' }];
    const threeRows = [...prior, { guess: 'SNIPY', marks: 'GBGYG' }];
    assert.deepEqual(validateBoard(clear(threeRows), prior), threeRows);
    assert.throws(() => validateBoard(clear([{ guess: 'TARES', marks: 'BBBBG' }]), prior), /row 1: saved TARES BBBBY; newly read TARES BBBBG/);
    const retryScope = { visualWordle: { connectionId: 'retry', displayId: '2' }, puzzleState: { wordle: { rows: prior } } };
    let retries = 0;
    const retryReply = await handle('done', { scope: retryScope, capture: { displayId: '2' }, interaction: { connectionId: 'retry' } }, {
        permission: () => ({ allowed: true }), checkpoint() {}, suggest: () => 'SPICY',
        extract: async (_capture, _request, options) => {
            retries++;
            if (retries === 1) return clear([{ guess: 'TARES', marks: 'BBBBG' }]);
            assert.equal(options.review, true);
            return clear(threeRows);
        },
    });
    assert.equal(retries, 2);
    assert.match(retryReply, /SNIPY GBGYG/);
    assert.deepEqual(retryScope.puzzleState.wordle.rows, threeRows);
    await assert.rejects(() => extract({ data: 'fixture' }, 'fixture', { prepare: async () => null, complete: async (_messages, options) => options.format
        ? JSON.stringify({ status: 'clear', reason: 'none', rows: [{ guess: 'SPLAT', colors: ['gray', 'gray', 'green', 'gray', 'green'] }] })
        : 'The row reads SLATE with gray, gray, green, gray, green.' }), /disagreed/);
    await assert.rejects(() => extract({ data: 'fixture' }, 'fixture', { prepare: async () => null, complete: async () => 'SLATE: gray, gray, green, gray, green' }), /measure their colors/);
    await assert.rejects(() => extract({ data: 'fixture' }, 'fixture', { prepare: async () => ({ data: 'crop', marks: ['BBBBY', 'GBGBG'] }), complete: async () => 'TARES' }), /every word/);
    assert.throws(() => validateBoard({ status: 'not_found', rows: [] }), /could not locate/);
    assert.throws(() => validateBoard({ status: 'uncertain', reason: 'small_tiles', rows: [] }), /too small/);
    assert.throws(() => validateBoard({ status: 'uncertain', rows: [] }), /confidently/);
    assert.throws(() => validateBoard(clear([{ guess: 'SLATE', marks: '?????' }])), /unclear/);
    assert.throws(() => validateBoard(clear([]), [{ guess: 'SLATE', marks: 'BBBBB' }]), /disagrees/);
    assert.throws(() => validateBoard(clear([{ guess: 'SLATE', marks: 'GGGGG' }, { guess: 'CRANE', marks: 'BBBBB' }])), /conflict/);
    const scope = { id: 'test', puzzleState: null };
    let observation = { status: 'uncertain', rows: [] }, calls = 0, saves = 0;
    const deps = { permission: () => ({ allowed: true }), extract: async () => { calls++; return observation; }, suggest: () => 'SLATE', checkpoint: () => { saves++; } };
    const options = { scope, capture: { displayId: '2', data: 'private-pixels' }, interaction: { connectionId: 'client-a' } };
    assert.equal(await handle('done', options, deps), null);
    assert.match(await handle('start Wordle on monitor 2', options, deps), /confidently/);
    assert.equal(saves, 0);
    observation = clear([]);
    assert.match(await handle('done', options, deps), /SLATE/);
    assert.equal(saves, 1, 'A failed first extraction must be retryable');
    const before = calls;
    assert.match(await handle('done', { ...options, interaction: { connectionId: 'client-b' } }, deps), /client that started/);
    assert.match(await handle('done', { ...options, capture: { displayId: '1' } }, deps), /different monitor/);
    assert.equal(calls, before);
    assert.match(await handle('done', options, deps), /No new completed row/);
    const row = { guess: 'SLATE', marks: wordle.feedback('SLATE', 'CRANE') };
    observation = clear([row]);
    assert.match(await handle('done', options, { ...deps, suggest: () => 'CRANE' }), /CRANE/);
    const saved = JSON.stringify(scope.puzzleState);
    observation = clear([]);
    assert.match(await handle('done', options, deps), /disagrees/);
    assert.equal(JSON.stringify(scope.puzzleState), saved);
    observation = clear([row, { guess: 'CRANE', marks: 'GGGGG' }]);
    assert.match(await handle('done', options, deps), /We got it/);
    assert.equal(scope.visualWordle, null);
    assert(!JSON.stringify(scope).includes('private-pixels'));
    assert.match(await handle('start Wordle', options, { ...deps, permission: () => ({ allowed: false }) }), /permissions/);
    const cancelled = { id: 'cancelled' };
    await handle('start Wordle', { ...options, scope: cancelled, isCancelled: () => true }, deps);
    assert.equal(cancelled.puzzleState, undefined);
    const start = Date.now();
    const guess = suggest({ rows: [row], candidates: [], rejectedCandidates: [] });
    assert(vocabulary.contains(guess));
    assert(wordle.inspect(guess, [row]).consistent);
    assert.equal(suggest({ rows: [], candidates: ['CRANE'], rejectedCandidates: [] }), 'CRANE');
    console.log(`Visual Wordle: extraction validation, retry, routing isolation, unchanged boards, cancellation, permissions, solved state and deterministic suggestion passed (${Date.now() - start}ms solver).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
