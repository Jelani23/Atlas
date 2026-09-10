const assert = require('node:assert/strict');
// Stub all storage dependencies before loading the real cache. No database access.
const stores = [
    ['longTermProfile', 'get', 'user_profile'], ['projectMemory', 'get', 'project_memory'],
    ['knowledgeLibrary', 'getAll', 'knowledge_library'], ['proceduralMemory', 'getAll', 'procedural_memory'],
    ['devState', 'getAll', 'dev_state'], ['reflectionJournal', 'getAll', 'reflections']
];
const reads = {};
for (const [name, method, store] of stores) {
    const id = require.resolve(`../src/memory/${name}`);
    reads[store] = async () => [{ id: 1, value: store }];
    require.cache[id] = { id, filename: id, loaded: true, exports: { [method]: () => reads[store]() } };
}
const cache = require('../src/core/memoryCache');
async function run() {
    for (const [, , store] of stores) {
        let release;
        const blocked = new Promise(resolve => { release = resolve; });
        reads[store] = () => blocked;
        const first = cache.getMemory(store);
        await Promise.resolve();
        cache.setHotMemory(store, [{ id: 1, value: 'old' }]);
        cache.setHotState('cacheKey', 'test');
        assert.equal(cache.isHotCacheValid('test'), true);
        cache.invalidate(store);
        assert.deepEqual(cache.getHotMemory(store), []);
        assert.equal(cache.isHotCacheValid('test'), false);
        reads[store] = async () => [{ id: 2, value: 'updated' }];
        const next = await cache.getMemory(store);
        release([{ id: 1, value: 'old' }]);
        assert.equal((await first)[0].data.value, 'updated');
        assert.equal((await cache.getMemory(store))[0].id, 2);
        cache.boostItem(store, 2, 5, 'Test');
        assert.equal(next[0].accessCount, 1, 'Boost mutates current cache entries');
    }
    cache.clearCache();
    for (const [, , store] of stores) assert.deepEqual(cache.getHotMemory(store), []);
    reads.knowledge_library = async () => { throw new Error('Storage unavailable'); };
    await assert.rejects(cache.getMemory('knowledge_library'), /Storage unavailable/);
    reads.knowledge_library = async () => [];
    assert.deepEqual(await cache.getMemory('knowledge_library'), []);
    console.log('memoryCacheInvalidation.test.js passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
