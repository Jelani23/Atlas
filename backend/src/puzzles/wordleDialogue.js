const state = require('../planner/state');
const store = require('./wordleStore');
const wordle = require('./wordle');
const vocabulary = require('./wordleVocabulary');
const model = require('./wordleInterpreter');
const { wordleService: service } = require('./puzzlePipeline');
const explicit = /^(?:please\s+)?(?:wordle|connections)\s*:/i;
function missingColors(partial) {
    return `For **${partial.guess}**, I still need the colors of positions ${partial.colors.flatMap((color, i) => color ? [] : [`${i + 1} (${partial.guess[i]})`]).join(', ')}.`;
}

function feedback(proposal, message, game, conversation) {
    let guess = proposal.guess?.trim().toUpperCase();
    if (!guess) guess = conversation.partial?.guess || conversation.pendingGuess;
    if (!guess || !/^[A-Z]{5}$/.test(guess)) throw new Error('Which word are these colors for?');
    const named = new RegExp(`\\b${guess}\\b`, 'i').test(message);
    if (!named && guess !== conversation.pendingGuess && guess !== conversation.partial?.guess)
        throw new Error('Which guess are you referring to? Please name it so I update the right row.');
    const existing = game.rows.find(row => row.guess === guess);
    if (proposal.action === 'correct' && existing && conversation.pendingGuess && conversation.pendingGuess !== guess && !named)
        throw new Error('Which earlier guess are you correcting?');
    if (!Array.isArray(proposal.colors) || proposal.colors.length !== 5 || !Array.isArray(proposal.evidence) || proposal.evidence.length !== 5)
        throw new Error('I could not reliably map those colors to the five tiles. Could you clarify the positions?');
    const colors = proposal.action === 'correct' && existing ? [...existing.marks]
        : conversation.partial?.guess === guess ? [...conversation.partial.colors] : Array(5).fill(null);
    let supplied = 0;
    proposal.colors.forEach((color, position) => {
        if (color === '?') return;
        const quote = proposal.evidence[position];
        if (!['B', 'Y', 'G'].includes(color) || typeof quote !== 'string' || !quote.trim() || !message.includes(quote))
            throw new Error('I could not tie each color to what you said. Could you clarify the colors?');
        // Repeated letters are ambiguous unless the quote explicitly locates
        // the occurrence or refers to all/both occurrences. Do not guess one.
        const repeats = [...guess].filter(letter => letter === guess[position]).length > 1;
        if (repeats && !(proposal.confirmedSolved && proposal.colors.every(c => c === 'G')) && !/\b(?:all|both|each|every|everything|rest|remaining|first|second|third|fourth|fifth|last|[1-5](?:st|nd|rd|th)?)\b|[🟩🟨⬛⬜]|\b[BGY]{5}\b/iu.test(quote)
            && (quote.match(/\b(?:green|yellow|gr[ae]y|black)\b/gi) || []).length < 5)
            throw new Error(`There is more than one ${guess[position]} in ${guess}. Which position has that color?`);
        if (colors[position] && colors[position] !== color && proposal.action !== 'correct')
            throw new Error(`That changes a color already reported for ${guess}. Are you correcting that row?`);
        colors[position] = color; supplied++;
    });
    if (!supplied) throw new Error('Which tile colors did you see? I do not have enough feedback to update the board yet.');
    if (existing && proposal.action !== 'correct' && colors.every(Boolean) && existing.marks !== colors.join(''))
        throw new Error(`Are you correcting ${guess}? I have different colors saved for that row.`);
    return { guess, colors, existing, complete: colors.every(Boolean) };
}

async function route(message, { history, interpret = model.interpret, choose = model.choose, discuss = model.discuss } = {}) {
    const scope = state.getSessionScope();
    if (scope.closed || explicit.test(message)) return null;
    store.restore(scope);
    if (!scope.puzzleConversation?.active && !/\bwordle\b/i.test(message)) return null;
    if (typeof message !== 'string' || message.length > 20000) return 'That message is too long for me to interpret as one puzzle turn.';
    const permission = require('../permissions/permissionManager').check('puzzleHelper');
    if (!permission.allowed || permission.requiresApproval) return 'The puzzle helper is unavailable under the current tool permissions.';
    if (scope.puzzleBusy) return "I'm still checking the previous turn. Give me a moment before sending another board update.";
    scope.puzzleBusy = true;
    let saved = false;
    const remember = reply => {
        if (scope.closed || reply == null) return reply;
        scope.wordleRecent = [...(scope.wordleRecent || []), { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-6);
        return reply + (scope.wordleStorageError ? '\n\n' + scope.wordleStorageError : '');
    };
    try {
        const conversation = structuredClone(scope.puzzleConversation || { active: false, pendingGuess: null, partial: null });
        let game = structuredClone(scope.puzzleState?.wordle || service.fresh());
        const context = { active: conversation.active, board: game.rows, pendingGuess: conversation.pendingGuess,
            partial: conversation.partial, recent: (history?.length ? history : scope.wordleRecent || []).slice(-6).map(turn => ({ role: turn.role, content: String(turn.content || '').slice(0, 1500) })) };
        const proposal = await interpret(message, context);
        if (scope.closed) return null;
        if (!proposal || typeof proposal.action !== 'string') return remember('I could not reliably interpret that turn. Were you reporting colors, rejecting a word, or asking for another guess?');
        if (!conversation.active && proposal.action === 'suggest' && /\bwordle\b/i.test(message)) proposal.action = 'start';
        if (proposal.action === 'other') return null;
        if (proposal.action === 'clarify') return remember('I am not sure which board update you mean. Could you tell me the guess and what happened to its tiles?');
        if (!conversation.active && !['start', 'new'].includes(proposal.action)) return remember('Would you like to start or resume a Wordle game?');
        if (scope.wordleLoadFailed && !['new', 'start'].includes(proposal.action)) return remember(scope.wordleStorageError);
        const commit = () => {
            if (scope.closed) return;
            scope.puzzleState = { ...scope.puzzleState, wordle: game };
            scope.puzzleConversation = conversation;
            scope.wordleLoadFailed = false;
            store.checkpoint(scope);
        };
        if (proposal.action === 'stop') {
            conversation.active = false; commit();
            return remember("Sure, let's leave Wordle there. Our board is saved if you want to come back to it.");
        }
        if (proposal.action === 'new') { game = service.fresh(); conversation.pendingGuess = null; conversation.partial = null; }
        conversation.active = true;
        if (proposal.action === 'start' && conversation.pendingGuess && vocabulary.contains(conversation.pendingGuess)) {
            commit(); return remember(`We were trying **${conversation.pendingGuess}**. What did the board show?`);
        }
        if (['feedback', 'correct'].includes(proposal.action)) {
            let update;
            try { update = feedback(proposal, message, game, conversation); }
            catch (error) { return remember(error.message); }
            if (!update.complete) {
                conversation.partial = { guess: update.guess, colors: update.colors }; commit();
                const missing = update.colors.flatMap((color, i) => color ? [] : [`${i + 1} (${update.guess[i]})`]);
                return remember(`I've kept those colors for ${update.guess}. What colors are positions ${missing.join(', ')}?`);
            }
            try { await service.record(`${update.existing ? 'correct ' : ''}${update.guess} ${update.colors.join('')}`, game); }
            catch { return remember(`Those colors for ${update.guess} conflict with the clues already recorded. Could you double-check that row?`); }
            conversation.partial = null; conversation.pendingGuess = null; saved = true;
        } else if (proposal.action === 'reject') {
            const rejected = (proposal.guess || conversation.pendingGuess || '').toUpperCase();
            if (!rejected || (rejected !== conversation.pendingGuess && !new RegExp(`\\b${rejected}\\b`, 'i').test(message)) || !/^[A-Z]{5}$/.test(rejected))
                return remember('Which word did the game refuse?');
            game.rejectedCandidates ||= [];
            if (game.rejectedCandidates.length >= 32) return remember('There have been many rejected words. We may need a different word list for this version of the game.');
            if (!game.rejectedCandidates.includes(rejected)) game.rejectedCandidates.push(rejected);
            if (conversation.pendingGuess === rejected) conversation.pendingGuess = null;
            if (conversation.partial?.guess === rejected) conversation.partial = null;
        } else if (proposal.action === 'status') {
            if (conversation.partial) return remember(missingColors(conversation.partial));
            return remember(conversation.pendingGuess ? `I'm waiting for the five colors for **${conversation.pendingGuess}**.` : service.status(game));
        } else if (['hint', 'discuss'].includes(proposal.action)) {
            commit();
            const reply = await discuss({ ...context, message, constraints: wordle.ledger(game.rows) });
            if (scope.closed) return null;
            return remember(reply || 'I am tracking the positions and letter counts from your reports. A yellow letter is present but belongs somewhere else; a gray duplicate can limit how many copies there are.');
        } else if (!['start', 'new', 'suggest'].includes(proposal.action)) return remember('Could you clarify what you want to do with this board?');
        commit();
        if (conversation.partial) return remember(missingColors(conversation.partial));
        const solved = game.rows.find(row => row.marks === 'GGGGG');
        if (solved) return remember(`We got it — **${solved.guess}**!`);
        if (game.rows.length >= 6) return remember("That's six guesses. We can review the clues or start another round.");
        const pool = vocabulary.shortlist(game);
        if (!pool.candidates.length) return remember('No word in my local vocabulary fits all those clues. Let’s check the board; this game may also use a different word list.');
        let candidate;
        try { candidate = await choose(pool.candidates, { message, rows: game.rows, rejectedWords: game.rejectedCandidates, remaining: pool.total }); }
        catch { /* A model failure cannot bypass the checked shortlist. */ }
        if (scope.closed) return null;
        // Use a checked fallback if the model returns prose or invents a word.
        if (!pool.candidates.includes(candidate)) candidate = pool.candidates[0];
        conversation.pendingGuess = candidate; commit();
        const lead = proposal.action === 'reject' ? "That one is out of the running. " : saved ? 'Got it. ' : '';
        return remember(`${lead}Let's try **${candidate}**.${game.rows.length ? ' It fits the clues so far.' : ''} What colors come back?`);
    } catch {
        return remember(saved ? "I've saved those colors, but couldn't finish choosing the next word. We can try again." : "I couldn't interpret that turn with the local model. The board hasn't changed; can you try again?");
    } finally { scope.puzzleBusy = false; }
}
module.exports = { route, feedback };
