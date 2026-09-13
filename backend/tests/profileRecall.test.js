const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async () => { throw new Error('No network in profile tests'); };
const { resolveProfileRecall } = require('../src/memory/profileRecall');
const cache = require('../src/core/memoryCache');
const registry = require('../src/memory/projectRegistry');
const worldModel = require('../src/memory/worldModel');
const { getRelevantContext } = require('../src/core/contextManager');
const { buildContext } = require('../src/core/contextBuilder');

async function main() {
    const questions = [
        "Yeah that sounds good. Let's do some quick tests on some things you should already know. What all do you remember about me?",
        "That's good, anything else you remember about me?",
        'What about some other of my favorite things?',
        'What is my favorite color', 'Could you tell me my favourite food',
        'Show my profile', 'Who am I'
    ];
    for (const question of questions) assert(resolveProfileRecall(question), question);
    for (const text of ['My favorite food is pasta', 'What is your favorite food',
        'Explain how user profiles work', 'What do you remember about Atlas', 'Anything else?']) {
        assert.equal(resolveProfileRecall(text), null, text);
    }
    const history = [{ role: 'user', content: questions[0] }, { role: 'assistant', content: 'You like engineering.' }];
    assert(resolveProfileRecall('Anything else?', history));
    assert.equal(resolveProfileRecall('Anything else?', [...history,
        { role: 'user', content: 'Explain the JavaScript event loop' }]), null);
    assert.equal(resolveProfileRecall('Anything else?', [{ role: 'assistant', content: questions[0] }]), null);

    // Synthetic rows stay in this mocked store; no fixture is written to a DB.
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, score: 10000,
        data: { id: i + 1, category: i < 6 ? 'identity' : 'behavior', key: `detail_${i}`, value: `Profile detail ${i}` }
    }));
    const favorites = ['color', 'anime', 'food', 'drink', 'animal', 'game', 'basketball_team'];
    favorites.forEach((key, i) => rows.push({ id: i + 21, score: 0,
        data: { id: i + 21, category: 'preference', key: `favorite_${key}`, value: `Stored ${key} preference` }
    }));
    rows.push({ id: 28, score: 0, data: { id: 28, category: 'state', key: 'current_project', value: 'atlas' } });
    let failed = false;
    cache.getMemory = async store => {
        if (store !== 'user_profile') return [];
        if (failed) throw new Error('Profile read failed');
        return rows;
    };
    registry.getAllProjects = async () => [{ project_key: 'atlas', name: 'Atlas', aliases: [] }];
    worldModel.getAll = async () => [];
    const retrieve = (input, turns = []) => getRelevantContext(input, turns, { intent: 'conversation' }, {
        workingMemory: { getRelevant: async () => [] }, sessionId: 100
    });
    const promptFor = context => buildContext({ mode: 'casual', intent: { intent: 'conversation' },
        userInput: questions[0], history: [], policy: 'NONE', workingContext: {},
        preprocessed: { relevantMemory: context }, toolResult: { needsTool: false }
    });
    for (const question of questions.slice(0, 3)) {
        const context = await retrieve(question, history);
        assert.equal(context.personal.length, 27);
        assert.equal(context.profileCoverage.omitted, 0);
        assert.equal(context.manifest.task, 'memory');
        assert(!context.personal.some(row => row.category === 'state'));
        const prompt = await promptFor(context);
        for (const favorite of favorites) assert(prompt.includes(`favorite_${favorite}: Stored ${favorite} preference`));
    }
    const ordinary = await retrieve('Tell me a joke');
    assert.equal(ordinary.profileCoverage, null);
    assert(ordinary.personal.length <= 8);
    // Even heavy old activation/history cannot crowd explicit favorites out.
    rows.slice(0, 20).forEach(row => { row.data.value = 'Long old unrelated detail. '.repeat(100); });
    const partial = await retrieve(questions[2], history);
    assert(partial.profileCoverage.omitted > 0);
    assert(partial.manifest.allocations.personal <= 1600);
    for (const favorite of favorites) assert(partial.personal.some(row => row.key === `favorite_${favorite}`));
    assert((await promptFor(partial)).includes('This is a partial view'));
    failed = true;
    const unavailable = await retrieve(questions[0]);
    assert.equal(unavailable.profileCoverage.status, 'unavailable');
    assert((await promptFor(unavailable)).includes('could not be loaded'));
    failed = false;
    rows.length = 0;
    const empty = await retrieve(questions[0]);
    assert.equal(empty.profileCoverage.status, 'loaded');
    assert.equal(empty.profileCoverage.available, 0);
    console.log('Profile recall: scope, all favorites, partial coverage and failed/empty reads passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
