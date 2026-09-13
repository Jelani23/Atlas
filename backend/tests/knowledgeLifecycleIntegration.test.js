// Extraction parsing -> semantic identity -> ingestion RPC -> review -> reopen
// persisted database -> recall -> undo. Model responses and HTTP transport are
// controlled fixtures; all business modules and SQL functions run normally.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createLocalClient } = require('./helpers/localKnowledgeClient');
function stub(name, exports) {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
let db;
const client = createLocalClient(() => db);
stub('../src/database/supabaseClient', client);
stub('../src/memory/projectRegistry', { getAllProjects: async () => [] });
let extraction, comparison;
stub('../src/models/modelAdapter', { createModelAdapter: () => ({ complete: async (messages, options) =>
    JSON.stringify(options.format.properties.memories ? { memories: [extraction] } : comparison) }) });
const { extractMemory } = require('../src/memory/memoryExtractor');
const { handleMemoryAction } = require('../src/memory/memoryManager');
const library = require('../src/memory/knowledgeLibrary');
const cache = require('../src/core/memoryCache');
const repository = require('../src/memory/knowledgeIngestionRepository').createRepository(client);
const resolution = require('../src/memory/knowledgeReviewResolution');
const maintenance = require('../src/memory/knowledgeMaintenance');
const { isKnowledgeRetrievable } = require('../src/memory/knowledgeAudit');

async function run() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-memory-lifecycle-'));
    try {
        db = new PGlite(directory);
        await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
        await db.exec(await fs.readFile(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8'));
        extraction = { category: 'knowledge', knowledge_category: 'technology', subject: 'fixture_service', key: 'database', value: 'Uses SQLite' };
        const initial = await extractMemory('Remember: the fixture service uses SQLite.');
        assert.equal(initial.memories[0].source_type, 'conversation');
        assert.ok(initial.memories[0].topics.length, 'Extractor defaulting must run');
        assert.equal((await handleMemoryAction(initial.memories[0])).action, 'saved');
        let rows = await library.getAll({ throwOnError: true });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].verification_status, 'needs_source');
        const originalId = rows[0].id;
        await cache.getMemory('knowledge_library');

        extraction = { ...extraction, key: 'storage_engine', value: 'SQLite stores its data' };
        comparison = { candidate_index: 0, entity: 'same', property: 'same', scope: 'same', values: 'equivalent', replacement_quote: '', confidence: 0.98, reason: 'Same database' };
        assert.equal((await handleMemoryAction((await extractMemory('SQLite stores the fixture service data.')).memories[0])).action, 'duplicate');
        rows = await library.getAll({ throwOnError: true });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, originalId);
        assert.equal(rows[0].value, 'Uses SQLite', 'Semantic refresh preserves canonical wording');
        extraction = { ...extraction, key: 'database', value: 'The database is SQLite' };
        assert.equal((await handleMemoryAction((await extractMemory('The fixture service database is SQLite.')).memories[0])).action, 'duplicate',
            'Exact keys must not force paraphrases into the review queue');
        assert.equal((await repository.listPending()).length, 0);

        extraction = { ...extraction, value: 'We now use PostgreSQL, replacing SQLite' };
        comparison = { ...comparison, values: 'incompatible', replacement_quote: extraction.value };
        assert.equal((await handleMemoryAction((await extractMemory('The fixture service now uses PostgreSQL, replacing SQLite.')).memories[0])).action, 'conflict');
        let pending = await repository.listPending();
        assert.equal(pending.length, 1, 'Model-classified updates still require review');
        assert.equal((await library.getById(originalId)).value, 'Uses SQLite');
        const details = await repository.inspectReview(pending[0].id);
        const accept = resolution.createPlan(details, 'accept_provisional', 'Reviewed synthetic replacement');
        await cache.getMemory('knowledge_library');
        await resolution.applyPlan(client, accept);
        await assert.rejects(resolution.applyPlan(client, accept), /already resolved/);
        assert.equal((await repository.listPending()).length, 0);

        // Separate administrative writes do not invalidate the running cache.
        assert.equal((await cache.getMemory('knowledge_library'))[0].data.value, 'Uses SQLite');
        await db.close();
        db = new PGlite(directory);
        cache.clearCache();
        const recalled = (await cache.getMemory('knowledge_library'))[0].data;
        assert.equal(recalled.id, originalId);
        assert.equal(recalled.value, extraction.value);
        assert.equal(recalled.verification_status, 'needs_source');
        assert.equal(isKnowledgeRetrievable(recalled), false, 'Restart must not promote provisional knowledge');

        const resolved = await repository.inspectReview(pending[0].id);
        const undo = maintenance.createPlan('undo_review', resolved.current_record, resolved.review, 'Undo synthetic replacement');
        await maintenance.applyPlan(client, undo);
        cache.clearCache();
        const restored = (await cache.getMemory('knowledge_library'))[0].data;
        assert.equal(restored.value, 'Uses SQLite');
        assert.equal(isKnowledgeRetrievable(restored), false);
        assert.equal((await library.getAll()).length, 1);
        const history = await client.from('knowledge_maintenance_events').select('*');
        assert.equal(history.data.length, 1);
        assert.equal(history.data[0].before_snapshot.value, extraction.value);
        assert.equal(history.data[0].after_snapshot.value, 'Uses SQLite');
        const beforeUncertain = await library.getById(originalId);
        extraction = { ...extraction, key: 'storage_description', value: 'SQLite provides the fixture service storage' };
        comparison = { candidate_index: 0, entity: 'same', property: 'different', scope: 'same', values: 'uncertain',
            replacement_quote: '', confidence: 0.6, reason: 'Fixture cannot confidently distinguish property labels' };
        assert.equal((await handleMemoryAction(extraction)).action, 'conflict');
        assert.equal((await library.getAll()).length, 1, 'An uncertain alias must not create another canonical record');
        assert.deepEqual(await library.getById(originalId), beforeUncertain, 'Review must leave the canonical snapshot intact');
        assert.equal((await repository.listPending()).length, 1, 'The uncertain proposal must be durable');
        comparison = { ...comparison, candidate_index: -1, property: 'same' };
        assert.equal((await handleMemoryAction({ ...extraction, key: 'another_alias' })).action, 'ignored');
        assert.equal((await library.getAll()).length, 1, 'Invalid model output must not create a canonical record');
        assert.equal((await repository.listPending()).length, 1, 'No arbitrary review target is invented for invalid output');
        console.log('knowledgeLifecycleIntegration.test.js passed (persisted local PostgreSQL; fixture model)');
    } finally {
        await db?.close();
        // mkdtemp returns a directory under the verified temporary root.
        const root = path.resolve(os.tmpdir());
        const target = path.resolve(directory);
        if (path.dirname(target) !== root || !path.basename(target).startsWith('atlas-memory-lifecycle-')) throw new Error('Unexpected test cleanup path');
        await fs.rm(target, { recursive: true, force: true });
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
