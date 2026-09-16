const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async () => { throw new Error('No network in personality tests'); };
const { atlasState } = require('../src/core/atlasState');
const { compilePersonalityProfile, getSystemPrompt, listModes, getReplyFocus } = require('../src/core/personalityEngine');
const { getResponseStyle } = require('../src/response/controller');
const { buildContext } = require('../src/core/contextBuilder');
require('../src/memory/worldModel').getAll = async () => null;

const original = JSON.stringify(atlasState);
const strings = value => typeof value === 'string' ? [value]
    : Object.values(value).flatMap(strings);

async function main() {
    // Data preservation is the contract: every existing profile value must
    // survive compilation in every mode, including all the quieter quirks.
    for (const mode of listModes()) {
        const prompt = getSystemPrompt(mode, 'NONE', getResponseStyle({ intent: 'memory' }));
        for (const value of strings(atlasState)) assert(prompt.includes(value), `${mode} dropped ${value}`);
        assert.equal(prompt.split('YOUR OWN PREFERENCES').length - 1, 1);
        assert(!prompt.includes('neutral and acknowledging'));
        assert(!prompt.includes('Tone: undefined'));
    }
    assert.equal(getResponseStyle({ intent: 'coding' }).allowMarkdown, true);
    assert.equal(getResponseStyle({ intent: 'conversation' }).allowMarkdown, false);
    assert(!getSystemPrompt('casual', 'NONE', { tone: 'UNRELATED IDENTITY OVERRIDE', length: 'brief', formatting: 'prose' }).includes('UNRELATED IDENTITY OVERRIDE'));
    const alternate = JSON.parse(original);
    alternate.identity.name = 'FixtureAgent';
    alternate.preferences.enjoys = ['fixture interest'];
    assert(compilePersonalityProfile(alternate).includes('fixture interest'));
    assert(!compilePersonalityProfile(alternate).includes('Amatsuka Uto'));
    assert.equal(JSON.stringify(atlasState), original, 'Compilation must not edit the original character');

    const prompt = await buildContext({
        mode: 'casual', intent: { intent: 'conversation' }, policy: 'NONE',
        userInput: 'What games do you like and which game do I like', history: [],
        responseStyle: getResponseStyle({ intent: 'conversation' }),
        workingContext: {}, toolResult: { needsTool: false },
        preprocessed: { relevantMemory: {
            hotState: { activeProject: null, activeFiles: [], currentTask: null },
            state: [], personal: [{ key: 'favorite_game', value: 'Minecraft' }],
            projects: [], projectNames: {}, activeProjectKey: null,
            knowledge: [], procedures: [], features: [], reflections: [], conversationHistory: []
        } }
    });
    for (const value of atlasState.traits) assert(prompt.includes(value));
    assert(!prompt.includes('idols: Ado'), 'A game question should not inject unrelated music tastes');
    assert(prompt.includes('games: Celeste, Spelunky, Hollow Knight, Undertale'));
    assert(prompt.includes('User Profile (Stable Facts):\n- favorite_game: Minecraft'));
    assert(prompt.includes('These preferences belong to you, not Jelani'));
    assert.equal(prompt.split(getReplyFocus()).length - 1, 1);
    assert(prompt.includes('selected context, not a search of all memory'));
    assert(!prompt.includes('cannot prove implementation'), 'Personal game recall should not receive unrelated implementation warnings');
    const overview = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'Tell me about yourself' });
    for (const value of strings(atlasState)) assert(overview.includes(value), `Overview dropped ${value}`);
    const music = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'What music and artists do you like' });
    assert(music.includes('Amatsuka Uto'));
    assert(!music.includes('water (a running'));
    const quirk = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'How do you feel about water' });
    assert(quirk.includes('water (a running, self-aware joke'));
    assert(!quirk.includes('games: Celeste'));
    const unrelated = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'SQLite is an in-process database library' });
    assert(!unrelated.includes('YOUR OWN PREFERENCES'));
    const dryJoke = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'Tell me a joke about debugging' });
    assert(!dryJoke.includes('water (a running'), 'A general joke request should not pull in the water quirk');
    const namedArtist = getSystemPrompt('casual', 'NONE', null, atlasState, { userInput: 'Do you like Ado' });
    assert(namedArtist.includes('idols: Ado'));
    const followUp = getSystemPrompt('casual', 'NONE', null, atlasState, {
        userInput: 'Anything else?', history: [{ role: 'user', content: 'What games do you like' }]
    });
    assert(followUp.includes('Hollow Knight'));
    assert(!followUp.includes('water (a running'));
    assert.equal(JSON.stringify(atlasState), original);
    console.log('Personality preservation, mode continuity, ownership and context assembly passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
