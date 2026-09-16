const assert = require('node:assert/strict');
const id = require.resolve('../src/database/supabaseClient');
let result = { data: [], error: null };
let rejection = null;
const query = {};
for (const method of ['select', 'eq', 'order', 'limit', 'overlaps']) query[method] = () => query;
query.then = (resolve, reject) => (rejection ? Promise.reject(rejection) : Promise.resolve(result)).then(resolve, reject);
require.cache[id] = { id, filename: id, loaded: true, exports: { from: () => query } };
const memory = require('../src/memory/workingMemory');
async function main() {
    assert.deepEqual(await memory.getHistory('a'), []);
    result = { data: [{ role: 'assistant', content: 'second' }, { role: 'user', content: 'first' }], error: null };
    assert.equal((await memory.getHistory('a'))[0].content, 'first');
    for (const failure of [{ message: '<html>502 Bad Gateway</html>' }, { message: 'permission denied' }]) {
        result = { data: null, error: failure };
        for (const read of [() => memory.getHistory('a'), () => memory.getRelevant(['game'], { sessionId: 'a' })]) {
            await assert.rejects(read, error => error.code === 'HISTORY_UNAVAILABLE' && !error.message.includes('<html>'));
        }
    }
    rejection = new Error('Network disconnected');
    await assert.rejects(() => memory.getHistory('a'), { code: 'HISTORY_UNAVAILABLE' });
    rejection = null;
    result = { data: null, error: null };
    await assert.rejects(() => memory.getHistory('a'), { code: 'HISTORY_UNAVAILABLE' });
    result = { data: [], error: null };
    assert.deepEqual(await memory.getHistory('a'), [], 'A recovered empty read remains distinct from failure');
    console.log('History failures propagate; genuine empty history and recovery remain usable.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
