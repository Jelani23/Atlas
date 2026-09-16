const assert = require('node:assert/strict');
const { resolveOperatingAnswer: operating, resolveEmptyEventRecall: recall } = require('../src/response/groundedAnswers');

for (const input of ['How does your memory work?', 'Could you explain how your memory works please?',
    'Does your memory reset between sessions?', 'Do you retain memories across conversations?']) {
    assert.match(operating(input), /durable memories across conversations/);
}
assert.match(operating('Does every message I send get saved to your memory?'), /Not every message/);
assert.match(operating('How does your knowledge library work?'), /provisional records/);
assert.match(operating('Can you explain how to delete a note?'), /you approve or deny/);
assert.equal(operating('Delete a note'), null);
for (const health of ['unknown', 'available', 'unavailable', 'disabled']) {
    const answer = operating('Is your TTS currently working?', {
        runtime: { tts: { enabled: false, provider: 'kokoro', health } },
        relevantMemory: { features: [{ feature: 'TTS', status: 'planned' }] }
    });
    assert.match(answer, /disabled in the current configuration/);
    assert.match(answer, /implemented Kokoro/);
    assert.match(answer, /outdated/);
    assert.doesNotMatch(answer, /ready to synthesize|fully operational/);
    assert.match(answer, { unknown: /readiness is unconfirmed/, available: /last health observation succeeded/,
        unavailable: /reported speech unavailable/, disabled: /reported speech disabled/ }[health]);
}
assert.match(operating('Is your speech output working?'), /setting is not available/);
assert.match(operating('Is your TTS working?', { runtime: { tts: { provider: 'other' } } }), /does not establish a working adapter/);
const question = 'Do you remember which game we played together last night?';
assert.match(recall(question), /context available to me/);
assert.doesNotMatch(recall(question), /resets|never|searched/);
for (const key of ['personal', 'projects', 'state', 'reflections', 'conversationHistory']) {
    assert.equal(recall(question, { relevantMemory: { [key]: [{ value: 'We played Celeste yesterday.' }] } }), null, key);
}
assert.match(recall(question, { history: [{ role: 'user', content: question }] }), /context available/);
assert.match(recall(question, {
    history: [{ role: 'user', content: 'SQLite is an in-process database library.' }, { role: 'assistant', content: 'We played Hollow Knight yesterday.' }],
    relevantMemory: { personal: [{ key: 'favorite_game', value: 'Minecraft and Celeste' }], reflections: [{ summary: 'We discussed SQLite.' }] },
    workingContext: { active_project: 'Atlas' }
}), /context available/);
assert.match(recall(question, { relevantMemory: { conversationHistoryStatus: 'unavailable' } }), /couldn't load/);
assert.equal(recall(question, { workingContext: { lastGame: 'Celeste' } }), null);
for (const input of ['What games do you like?', 'What happened in the news yesterday?',
    'Write a story about what we did yesterday']) {
    assert.equal(recall(input), null);
}
// Requests with pending tool results belong to the normal tool-result path.
assert.equal(recall(question, { toolResult: { needsTool: true } }), null);
for (const input of ['Turn on your TTS', 'Is your TTS working and what games do you like?', 'What games do you like?']) {
    assert.equal(operating(input), null);
}
assert.equal(operating('Is your TTS working?', { toolResult: { needsTool: true } }), null);
console.log('Grounded operating answers and conservative recall boundaries passed.');
