// Opt-in: contacts only the local Ollama service. Never executes classified tools.
const { interpret } = require('../src/intent/inputUnderstanding');
const cases = [
    ['The word count feature works really well.', 'chat'],
    ['Search the web for basketball scores', 'tools'],
    ['Could you work out 12 times 4 for me?', 'tools'],
    ['Could you count the words in "one two three four"?', 'tools'],
    ['Read the file README.md', 'tools'],
    ['How does the recovery file avoid repeating text?', 'tools'],
    ['Do not delete README.md', 'chat'],
    ['Explain how file deletion works', 'chat'],
    ['Nice work, now search the web for basketball scores', 'tools'],
    ['I fixed it. Could you see what is over on the other monitor?', 'screen'],
    ['Another round of wordle please', 'wordle'],
    ['Calculate 2 + 2 and then word count of hello world', 'tools'],
    ['Tell me what is shown on monitor 2', 'screen'],
    ['Hey Alice how are you doing?', 'chat'],
    ["We've been able to upgrade a few of your features. The screen sharing feature seems to be working pretty well.", 'chat'],
    ['Could you explain to me how deleting a file works?', 'chat'],
    ['Could you work out what 12 times 4 is for me?', 'tools'],
    ["Can you count the words in 'one two three four'", 'tools'],
    ['Read the code for src/core/contextManager.js lines 2-4.', 'tools'],
    ['Alright, I think we fixed it. Could you see what’s on my other monitor?', 'screen'],
    ['Alright I played alert', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['go look at the screen and see', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['Ok I entered it, take another look', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['Ok look again', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['Look at the other monitor', 'screen', { activeTask: 'wordle' }],
    ['Ok so continue playing the wordle game on my other monitor', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['I submitted your suggestion, what should we try next?', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['The tiles have settled now, your turn', 'wordle', { activeTask: 'wordle' }, 'read'],
    ['I played Wordle yesterday and it was fun', 'chat', { activeTask: 'wordle' }],
    ["I haven't entered your guess yet", 'chat', { activeTask: 'wordle' }],
    ['How does Wordle choose its answer?', 'chat', { activeTask: 'wordle' }],
    ['Stop playing Wordle for now', 'wordle', { activeTask: 'wordle' }, 'stop'],
    ['What is visible on this monitor now?', 'screen', { activeTask: 'wordle' }],
    ['Could you look up the weather for Chicago?', 'tools'],
    ['Would you mind finding package.json for me?', 'tools'],
    ['Can you check my fantasy basketball roster?', 'tools'],
    ['I was just talking about web search, please do not search anything', 'chat'],
    ['"Delete the note called scratchpad" is an example command', 'chat'],
    ['Look at my screen and search the web for basketball scores', 'clarify'],
    ['Could you calculate 5 plus 7 and then count the words in "hello there"?', 'tools'],
];
(async () => {
    const selected = process.argv.includes('--holdout') ? require('./fixtures/inputUnderstandingHoldout.json') : cases;
    let passed = 0;
    for (const [text, expected, context = { recentTask: 'wordle' }, action] of selected) {
        const result = await interpret(text, context);
        const ok = result.disposition === expected && (!action || result.requests?.[0]?.action === action);
        passed += Number(ok);
        console.log(JSON.stringify({ ok, text, expected, action, actual: result.disposition, actualAction: result.requests?.[0]?.action, source: result.source, elapsedMs: result.elapsedMs, reason: result.reason }));
    }
    console.log(`${passed}/${selected.length} local interpretation cases passed. No tools executed.`);
    if (passed !== selected.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
