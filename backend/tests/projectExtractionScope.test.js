const assert = require('node:assert/strict');
const { projectExtractionScope } = require('../src/memory/projectExtractionScope');
const projects = [
    { project_key: 'atlas', name: 'Atlas', aliases: ['atlas system'] },
    { project_key: 'bindex', name: 'Bindex', aliases: ['book index'] }
];
const active = { current_project: 'atlas' };
for (const text of [
    'The cedar_demo_service uses SQLite as its database engine.',
    'The cedar_demo_service stores its data in a SQLite database.',
    'The cedar_demo_service now uses PostgreSQL as its database engine, replacing SQLite.',
    'Atlasian uses PostgreSQL for storage.', 'The atlas_service uses SQLite.',
    'Redis stores cached responses in memory.'
]) assert.deepEqual(projectExtractionScope(text, projects, active), [], text);
assert.deepEqual(projectExtractionScope('Atlas uses SQLite.', projects, {}), [projects[0]]);
assert.deepEqual(projectExtractionScope('The book index uses SQLite.', projects, active), [projects[1]]);
assert.deepEqual(projectExtractionScope('This project uses SQLite.', projects, active), [projects[0]]);
assert.deepEqual(projectExtractionScope('This project uses SQLite.', projects, {}), []);
assert.deepEqual(projectExtractionScope('Bindex integrates with Atlas.', projects, active), projects);

let response, options;
function stub(module, exports) {
    const id = require.resolve(module);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../src/memory/projectRegistry', { getAllProjects: async () => projects });
stub('../src/models/modelAdapter', { createModelAdapter: () => ({ complete: async (_messages, config) => {
    options = config; return JSON.stringify(response);
} }) });
const extractor = require('../src/memory/memoryExtractor');
async function main() {
    // A provider ignoring the schema must not attach the unrelated service to Atlas.
    response = { memories: [{ category: 'project', project_key: 'atlas', key: 'database', value: 'SQLite' }] };
    assert.equal((await extractor.extractMemory('The cedar_demo_service uses SQLite.', active)).memories.length, 0);
    assert.ok(!options.format.properties.memories.items.properties.category.enum.includes('project'));
    response = { memories: [{ category: 'project', key: 'database', value: 'SQLite' }] };
    assert.equal((await extractor.extractMemory('Atlas uses SQLite.', active)).memories.length, 0);
    const item = options.format.properties.memories.items;
    const branch = item.anyOf.find(option => option.properties.category.const === 'project');
    assert.ok(branch.required.includes('project_key'));
    assert.deepEqual(branch.properties.project_key.enum, ['atlas']);
    response.memories[0].project_key = 'atlas';
    assert.equal((await extractor.extractMemory('Atlas uses SQLite.', active)).memories[0].project_key, 'atlas');
    console.log('projectExtractionScope.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
