// Small local checkpoint, separate from chat history and durable learned memory.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const wordle = require('./wordle');
function filename(id) {
    const root = process.env.WORDLE_STATE_DIR || path.join(__dirname, '../../.local/wordle-games');
    return path.join(root, createHash('sha256').update(String(id)).digest('hex') + '.json');
}
function validate(value) {
    if (!value || value.version !== 1 || !value.game || !Array.isArray(value.game.rows) || value.game.rows.length > 6) throw new Error('Invalid Wordle save.');
    const game = value.game;
    for (const row of game.rows) {
        if (!row || wordle.word(row.guess) !== row.guess || wordle.marks(row.marks) !== row.marks) throw new Error('Invalid saved row.');
    }
    if (new Set(game.rows.map(row => row.guess)).size !== game.rows.length || !wordle.isFeasible(game.rows)) throw new Error('Saved rows conflict.');
    for (const [key, limit] of [['candidates', 256], ['rejectedCandidates', 32]]) {
        if (!Array.isArray(game[key]) || game[key].length > limit || game[key].some(item => wordle.word(item) !== item)) throw new Error('Invalid saved words.');
    }
    const conversation = value.conversation;
    if (conversation !== null) {
        if (!conversation || typeof conversation.active !== 'boolean') throw new Error('Invalid saved conversation.');
        if (conversation.pendingGuess !== null && (wordle.word(conversation.pendingGuess) !== conversation.pendingGuess
            || !wordle.inspect(conversation.pendingGuess, game.rows).consistent)) throw new Error('Invalid pending guess.');
        if (conversation.partial !== null) {
            const partial = conversation.partial;
            if (!partial || wordle.word(partial.guess) !== partial.guess || !Array.isArray(partial.colors)
                || partial.colors.length !== 5 || partial.colors.some(color => ![null, 'B', 'Y', 'G'].includes(color))) throw new Error('Invalid partial feedback.');
        }
    }
    // Whitelist fields instead of spreading arbitrary stored content into state.
    return { game: { rows: game.rows.map(row => ({ guess: row.guess, marks: row.marks })),
        candidates: [...game.candidates], rejectedCandidates: [...game.rejectedCandidates] },
        conversation: conversation === null ? null : { active: conversation.active, pendingGuess: conversation.pendingGuess,
            partial: conversation.partial ? { guess: conversation.partial.guess, colors: [...conversation.partial.colors] } : null } };
}
function restore(scope) {
    if (scope.wordleLoaded || scope.closed || scope.id == null) return;
    scope.wordleLoaded = true;
    try {
        const file = filename(scope.id);
        if (fs.statSync(file).size > 65536) throw new Error('Wordle save is too large.');
        const saved = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
        scope.puzzleState = { ...scope.puzzleState, wordle: saved.game };
        scope.puzzleConversation = saved.conversation;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            scope.wordleStorageError = 'I could not read the saved Wordle board. Please start a new Wordle game or give me the board again.';
            scope.wordleLoadFailed = true;
            console.warn('[WordleStore] Saved board was not loaded:', error.message);
        }
    }
}
function save(scope) {
    if (scope.closed || scope.id == null || !scope.puzzleState?.wordle) return;
    const data = { version: 1, updatedAt: new Date().toISOString(), game: scope.puzzleState.wordle, conversation: scope.puzzleConversation || null };
    validate(data);
    const file = filename(scope.id), temporary = file + '.' + randomUUID() + '.tmp';
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, file);
        scope.wordleStorageError = null;
        scope.wordleLoadFailed = false;
    } finally {
        try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') console.warn('[WordleStore] Temporary save cleanup failed.'); }
    }
}
function checkpoint(scope) {
    try { save(scope); }
    catch (error) {
        console.warn('[WordleStore] Checkpoint failed:', error.message);
        scope.wordleStorageError = 'The board is still in memory, but I could not save it to disk; it may be lost on restart.';
    }
}
function remove(id) {
    if (id == null) return;
    try { fs.unlinkSync(filename(id)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
module.exports = { restore, save, checkpoint, remove, filename, validate };
