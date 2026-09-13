// Opt-in local model acceptance using an isolated PostgreSQL database.
// The application extractor, comparator, manager, repositories and SQL run;
// Supabase HTTP is replaced. Atlas is registered and active, as in the app test.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main(args) {
    const factual = args.length === 2 && args[0] === '--live' && args[1] === '--facts';
    if (!factual && (args.length !== 1 || args[0] !== '--live')) {
        console.log('Use --live [--facts] to validate memory ingestion with local Ollama and isolated PostgreSQL. No production memory access.');
        return;
    }
    require('dotenv').config({ quiet: true });
    if ((process.env.ATLAS_MODEL_PROVIDER || 'ollama') !== 'ollama') throw new Error('This validation requires local Ollama.');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options = {}) => {
        if (String(url) !== 'http://localhost:11434/api/chat') throw new Error('Only local Ollama requests are allowed in this validation.');
        return originalFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(45000) });
    };
    const { PGlite } = require('@electric-sql/pglite');
    let db;
    const client = require('../tests/helpers/localKnowledgeClient').createLocalClient(() => db);
    function stub(module, exports) {
        const id = require.resolve(module);
        require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    stub('../src/database/supabaseClient', client);
    const projects = [{ id: 1, name: 'Atlas', project_key: 'atlas', aliases: ['atlas system'] }];
    stub('../src/memory/projectRegistry', {
        getAllProjects: async () => projects,
        findProject: async name => projects.find(p => [p.name, p.project_key, ...p.aliases].some(n => n.toLowerCase() === String(name).toLowerCase())) || null,
        findProjectByKey: async key => projects.find(p => p.project_key === key) || null
    });
    const modelCalls = [];
    const adapterModule = require('../src/models/modelAdapter');
    stub('../src/models/modelAdapter', { ...adapterModule, createModelAdapter: (...factoryArgs) => {
        const adapter = adapterModule.createModelAdapter(...factoryArgs);
        const complete = adapter.complete.bind(adapter);
        return { ...adapter, complete: async (messages, options) => {
            const started = Date.now();
            const response = await complete(messages, options);
            modelCalls.push({ stage: options?.format?.properties?.memories ? 'extraction' : 'comparison',
                model: options?.model || process.env.OLLAMA_MODEL || 'qwen3.5:4b', durationMs: Date.now() - started, response });
            return response;
        } };
    } });
    const extractor = require('../src/memory/memoryExtractor');
    const { checkEligibility } = require('../src/memory/memoryEligibility');
    const deterministic = require('../src/memory/deterministicExtractor');
    const enricher = require('../src/memory/semanticEnricher');
    const manager = require('../src/memory/memoryManager');
    const library = require('../src/memory/knowledgeLibrary');
    const reviews = require('../src/memory/knowledgeIngestionRepository').createRepository(client);
    const resolution = require('../src/memory/knowledgeReviewResolution');
    const maintenance = require('../src/memory/knowledgeMaintenance');
    const cache = require('../src/core/memoryCache');
    const { isKnowledgeRetrievable } = require('../src/memory/knowledgeAudit');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-live-memory-'));
    const report = { mode: 'synthetic_local_model_and_database', generatedAt: new Date().toISOString(),
        model: process.env.OLLAMA_MODEL_MEMORY?.trim() || process.env.OLLAMA_MODEL || 'qwen3.5:4b', modelCalls, scenario: factual ? 'documented_facts' : 'synthetic_replacement', activeProject: 'atlas', registeredProjects: projects, steps: [], passed: false };
    async function ingest(message, expectedSubject) {
        const step = { message, eligibility: await checkEligibility(message) };
        report.steps.push(step);
        assert.equal(step.eligibility.eligible, true, 'Fixture must pass the real eligibility gate');
        let extracted = await deterministic.extract(message);
        step.extractionPath = extracted.deterministic ? 'deterministic_and_enrichment' : 'fallback_model';
        if (extracted.deterministic) extracted.memories = await enricher.enrichMemories(extracted.memories);
        else extracted = await extractor.extractMemory(message, { current_project: 'atlas', current_topic: 'database' });
        const memories = extracted.memories || [];
        step.extracted = extracted;
        assert.equal(memories.length, 1, 'Expected one atomic extracted fixture claim');
        assert.equal(memories[0].category, 'knowledge', 'Fixture must enter the knowledge bank');
        if (expectedSubject) assert.equal(memories[0].subject, expectedSubject, 'Subject must identify the owner, not the property value');
        step.result = await manager.handleMemoryAction(memories);
        return step.result;
    }
    try {
        db = new PGlite(directory);
        await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
        await db.exec(await fs.readFile(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8'));
        if (factual) {
            const facts = require('../tests/fixtures/factualMemoryCases');
            report.sources = facts.map(fact => fact.source);
            report.caseResults = [];
            for (const fact of facts) {
                try {
                    const result = await ingest(fact.message, fact.subject);
                    report.caseResults.push({ message: fact.message, expected: fact.action, actual: result.action, passed: result.action === fact.action });
                } catch (error) {
                    report.caseResults.push({ message: fact.message, passed: false, error: error.message });
                }
            }
            assert.equal((await reviews.listPending()).length, 0, 'Different real entities must not conflict');
            await db.close();
            db = new PGlite(directory);
            cache.clearCache();
            const recalled = (await cache.getMemory('knowledge_library')).map(item => item.data);
            report.recalled = recalled;
            assert.ok(report.caseResults.every(result => result.passed), 'Some factual ingestion cases failed; see caseResults and modelCalls');
            assert.equal(recalled.length, 2);
            assert.deepEqual(recalled.map(row => row.subject).sort(), ['postgresql', 'sqlite']);
            assert.ok(recalled.every(row => !isKnowledgeRetrievable(row)), 'A test source citation is not runtime verification');
            report.recalled = recalled;
            report.passed = true;
            return;
        }
        report.explicitProjectExtraction = await extractor.extractMemory('Atlas relies on Supabase for persistent memory.', { current_project: 'atlas' });
        assert.equal(report.explicitProjectExtraction.memories.length, 1);
        assert.equal(report.explicitProjectExtraction.memories[0].category, 'project');
        assert.equal(report.explicitProjectExtraction.memories[0].project_key, 'atlas');
        // Unregistered entities must pass eligibility and reach knowledge extraction.
        assert.equal((await ingest('The cedar_demo_service uses SQLite as its database engine.', 'cedar_demo_service')).action, 'saved');
        let rows = await library.getAll({ throwOnError: true });
        assert.equal(rows.length, 1);
        const original = rows[0];
        assert.match(original.value, /SQLite/i);
        assert.equal((await ingest('The cedar_demo_service stores its data in a SQLite database.', 'cedar_demo_service')).action, 'duplicate');
        assert.equal((await library.getAll()).length, 1, 'Paraphrase must not create another canonical row');
        assert.equal((await ingest('The cedar_demo_service now uses PostgreSQL as its database engine, replacing SQLite.', 'cedar_demo_service')).action, 'conflict');
        const pending = await reviews.listPending();
        assert.equal(pending.length, 1);
        assert.equal((await library.getById(original.id)).value, original.value);
        const details = await reviews.inspectReview(pending[0].id);
        await resolution.applyPlan(client, resolution.createPlan(details, 'accept_provisional', 'Accept synthetic local fixture'));
        await db.close();
        db = new PGlite(directory);
        cache.clearCache();
        const recalled = (await cache.getMemory('knowledge_library'))[0].data;
        assert.equal(recalled.id, original.id);
        assert.match(recalled.value, /PostgreSQL/i);
        assert.equal(isKnowledgeRetrievable(recalled), false, 'Acceptance must not grant trusted retrieval');
        const resolved = await reviews.inspectReview(pending[0].id);
        await maintenance.applyPlan(client, maintenance.createPlan('undo_review', resolved.current_record, resolved.review, 'Undo synthetic local fixture'));
        cache.clearCache();
        const restored = (await cache.getMemory('knowledge_library'))[0].data;
        assert.equal(restored.value, original.value);
        assert.equal(isKnowledgeRetrievable(restored), false);
        report.passed = true;
        report.recalled = recalled;
        report.restored = restored;
    } catch (error) { report.error = error.message; process.exitCode = 1; }
    finally {
        await db?.close();
        globalThis.fetch = originalFetch;
        const target = path.resolve(directory);
        if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('atlas-live-memory-')) throw new Error('Unexpected fixture cleanup path');
        await fs.rm(target, { recursive: true, force: true });
        const reports = path.resolve(__dirname, '../.local/lifecycle-validations');
        await fs.mkdir(reports, { recursive: true });
        const file = path.join(reports, `${Date.now()}.json`);
        await fs.writeFile(file, JSON.stringify(report, null, 2), { flag: 'wx' });
        console.log(JSON.stringify({ passed: report.passed, error: report.error, report: file }, null, 2));
    }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
