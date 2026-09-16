const assert = require('node:assert/strict');
const { resolvePreferenceComparison: answer } = require('../src/response/preferenceAnswers');
const question = 'What games do I like, and what games do you like?';
const memory = { personal: [{ key: 'favorite_games', value: 'Minecraft and Celeste' }, { key: 'name', value: 'Jelani' },
    { key: 'game_played', value: 'Terraria' }] };
const reply = answer(question, memory);
assert.match(reply.split('As for me')[0], /Minecraft and Celeste/);
assert.doesNotMatch(reply.split('As for me')[0], /Spelunky|Hollow Knight/);
assert.doesNotMatch(reply, /Terraria/, 'An event is not a preference');
assert.match(reply.split('As for me')[1], /Spelunky, Hollow Knight/);
assert.match(answer('Which games do you enjoy and which games do I enjoy?', memory), /Minecraft/);
assert.match(answer(question, {}), /records available here/);
assert.match(answer(question, { ...memory, profileCoverage: { status: 'unavailable' } }), /couldn't load/);
const custom = { preferences: { enjoys: ['games: Fixture Game'] } };
assert.match(answer(question, memory, {}, custom), /Fixture Game/);
assert(!answer(question, memory, {}, custom).includes('Hollow Knight'));
for (const text of ['What games do you like?', 'What games do I like, and why do you like yours?', question + ' Save a note.']) {
    assert.equal(answer(text, memory), null, text);
}
assert.equal(answer(question, memory, { needsTool: true }), null);
console.log('Comparison replies preserve owner-specific records and the existing personality source.');
