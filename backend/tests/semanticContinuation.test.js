const assert = require('node:assert/strict');
const { prepare } = require('../src/intent/prepareInput');
const { decide } = require('../src/intent/inputUnderstanding');
const state = require('../src/planner/state');
const renderer = require('../src/response/wordleResponseRenderer');
const context = { sessionId: 'semantic-continuation-test', interaction: { connectionId: 'semantic-client', client: { capabilities: { screenshot: { supported: true } } } },
    screens: { displays: [{ id: 'primary', primary: true }, { id: 'app', current: true }] } };
function proposal(text, relative, monitor = 0) {
    return { clauses: [{ text, kind: 'request', domain: 'screen', action: 'inspect', confidence: 0.96, target: { relative, monitor } }] };
}
(async () => {
    const text = 'Take a peek at the one without your window on it.';
    const result = await prepare(text, context, { complete: async () => JSON.stringify(proposal(text, 'other')) });
    assert.equal(result.displayId, 'primary', 'Semantic targeting must survive beyond classification');
    assert.equal(result.task, 'screen');
    const ambiguous = await prepare(text, context, { complete: async () => JSON.stringify(proposal(text, 'ambiguous')) });
    assert.equal(ambiguous.action, 'clarify');
    const outOfRange = await prepare(text, context, { complete: async () => JSON.stringify(proposal(text, 'numbered', 8)) });
    assert.equal(outOfRange.action, 'clarify');
    const unsupported = await prepare(text, { ...context, interaction: { ...context.interaction, client: {} } }, { complete: async () => JSON.stringify(proposal(text, 'other')) });
    assert.equal(unsupported.action, 'clarify');
    assert.throws(() => decide(text, proposal(text, 'other', 2)), /Invalid capture target/);
    const explicit = 'Please examine monitor 2 carefully for me.';
    const literal = await prepare(explicit, context, { interpret: async () => decide(explicit, proposal(explicit, 'numbered', 1)) });
    assert.equal(literal.displayId, 'app', 'Explicit monitor number outranks contradictory semantic proposal');
    let messages;
    const reply = await renderer.build({ result: { task: 'wordle', status: 'suggestion', guess: 'SPICY' },
        fallback: 'Try SPICY.', personality: 'Existing personality profile', userInput: 'Your move, Alice.',
        history: [{ role: 'user', content: 'Keep it relaxed.' }] }, { complete: async input => {
            messages = input; return JSON.stringify({ text: 'I would go with {{guess}} next.' });
        } });
    assert.match(reply, /SPICY/);
    assert.match(messages[0].content, /Existing personality profile/);
    assert.ok(messages.some(message => message.content.includes('Your move, Alice.') && message.content.includes('Keep it relaxed.')));
    state.endSession(context.sessionId);
    console.log('Semantic target validation, client boundaries and contextual personality composition passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
