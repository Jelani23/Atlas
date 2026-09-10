// backend/tests/knowledgeMemoryAudit.test.js
//
// Audit for the knowledge-memory architecture: eligibility detection
// for general factual/hedged statements, canonical identity
// (category + subject + key), and insert/duplicate-refresh/update
// semantics through the real memoryManager.js + memoryDeduplicator.js
// decision logic - covering the implementation plan's §17 Tests A-G.
//
// This fakes knowledgeLibrary.js itself (in-memory, not a Supabase
// query-builder mock) so the real orchestration/decision code in
// memoryManager.js and memoryDeduplicator.js gets exercised end to
// end without a live database. knowledgeLibrary.js's own SQL
// (upsert/onConflict, the unique constraint, the GIN index) still
// needs verifying against a real Postgres/Supabase instance - that's
// what migrations/001_knowledge_library_upgrade.sql and
// supabase_schema.sql are for; this file verifies the deterministic
// decision logic sitting on top of it.
//
// Run with: node tests/knowledgeMemoryAudit.test.js

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sandbox-placeholder-key';

/**
 * ============================================================
 * FAKES (installed before any real module can cache the real one)
 * ============================================================
 */

function installFakeModule(relativePathFromThisFile, exportsObj) {
    const resolved = require.resolve(relativePathFromThisFile);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: exportsObj
    };
    return resolved;
}

function slug(value, fallback) {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    return normalized || fallback;
}

function identityKey(category, subject, key) {
    return `${slug(category, 'general')}|${slug(subject, 'general')}|${slug(key, key)}`;
}

const fakeKnowledgeStore = new Map();
let fakeNextId = 1;
const fakeWriteLog = [];

function fakeBuildRow(memoryData, existing) {
    return {
        id: existing ? existing.id : fakeNextId++,
        category: slug(memoryData.category, 'general'),
        subject: slug(memoryData.subject, 'general'),
        topics: Array.isArray(memoryData.topics)
            ? [...new Set(memoryData.topics.map(t => slug(t, '')).filter(Boolean))]
            : [],
        type: slug(memoryData.type, 'fact'),
        key: slug(memoryData.key, memoryData.key),
        value: memoryData.value,
        confidence: memoryData.confidence ?? 1.0,
        source: memoryData.source || null,
        source_type: slug(memoryData.source_type, 'conversation'),
        created_at: existing ? existing.created_at : new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

const fakeKnowledgeLibrary = {
    async find(category, subject, key) {
        if (!category || !subject || !key) return null;
        return fakeKnowledgeStore.get(identityKey(category, subject, key)) || null;
    },
    async addKnowledge(memoryData) {
        const id = identityKey(memoryData.category, memoryData.subject, memoryData.key);
        if (fakeKnowledgeStore.has(id)) {
            throw new Error('duplicate key value violates unique constraint "knowledge_library_category_subject_key_key"');
        }
        const row = fakeBuildRow(memoryData, null);
        fakeKnowledgeStore.set(id, row);
        fakeWriteLog.push({ op: 'insert', row: { ...row } });
        return true;
    },
    async updateKnowledge(memoryData) {
        const id = identityKey(memoryData.category, memoryData.subject, memoryData.key);
        const existing = fakeKnowledgeStore.get(id);
        if (!existing) {
            throw new Error('Knowledge update matched no existing record.');
        }
        const row = fakeBuildRow(memoryData, existing);
        fakeKnowledgeStore.set(id, row);
        fakeWriteLog.push({ op: 'update', row: { ...row } });
        return true;
    },
    async upsertKnowledge(memoryData, options = {}) {
        const id = identityKey(memoryData.category, memoryData.subject, memoryData.key);
        const existing = fakeKnowledgeStore.get(id) || null;
        if (options.forceReview || (existing && existing.value !== memoryData.value && !options.equivalent)) {
            return { action: 'review', review_id: 1, reason: 'Different value requires review' };
        }
        const row = fakeBuildRow(memoryData, existing);
        fakeKnowledgeStore.set(id, row);
        fakeWriteLog.push({ op: existing ? 'upsert(refresh)' : 'upsert(insert)', row: { ...row } });
        return { action: existing ? 'refreshed' : 'inserted', record_id: 1 };
    },
    async getAll() {
        return [...fakeKnowledgeStore.values()];
    },
    async getByCategory(category) {
        return [...fakeKnowledgeStore.values()].filter(r => r.category === slug(category, 'general'));
    },
    async getBySubject(category, subject) {
        return [...fakeKnowledgeStore.values()].filter(
            r => r.category === slug(category, 'general') && r.subject === slug(subject, 'general')
        );
    },
    async getByTopics(topics = []) {
        const normalized = topics.map(t => slug(t, '')).filter(Boolean);
        return [...fakeKnowledgeStore.values()].filter(r => r.topics.some(t => normalized.includes(t)));
    },
    async search(query) {
        const q = query.toLowerCase();
        return [...fakeKnowledgeStore.values()].filter(r => r.value.toLowerCase().includes(q));
    },
    async getContextString() {
        return [...fakeKnowledgeStore.values()]
            .map(r => `- [${r.category}/${r.subject}/${r.key}] ${r.value}`)
            .join('\n');
    },
    normalizeTopics: (topics) =>
        Array.isArray(topics) ? [...new Set(topics.map(t => slug(t, '')).filter(Boolean))] : [],
    KNOWN_KNOWLEDGE_TYPES: ['fact', 'definition', 'concept', 'relationship', 'observation', 'claim', 'assumption', 'hypothesis'],
    KNOWN_SOURCE_TYPES: ['user_statement', 'conversation', 'web_search', 'document', 'tool', 'model_knowledge', 'reasoning'],
    _reset() {
        fakeKnowledgeStore.clear();
        fakeWriteLog.length = 0;
        fakeNextId = 1;
    }
};

installFakeModule('../src/memory/knowledgeLibrary', fakeKnowledgeLibrary);

// projectRegistry is required transitively (memoryManager -> projectResolver
// -> projectRegistry); knowledge memories never actually exercise project
// resolution, but the require chain still needs to resolve without hitting
// a real Supabase instance.
installFakeModule('../src/memory/projectRegistry', {
    async getAllProjects() { return []; },
    async findProject() { return null; },
    async findProjectByKey() { return null; },
    async projectExists() { return false; },
    normalizeProjectName: (n) => String(n || '').trim().toLowerCase(),
    normalizeProjectKey: (k) => String(k || '').trim().toLowerCase().replace(/\s+/g, '-')
});

let fakeCompleteImpl = async () => '{"memories":[],"conversation_update":{}}';
const fakeCompleteCallLog = [];

installFakeModule('../src/models/modelAdapter', {
    createModelAdapter() {
        return {
            async complete(messages, options) {
                fakeCompleteCallLog.push({ messages, options });
                return fakeCompleteImpl(messages, options);
            }
        };
    }
});

/**
 * ============================================================
 * MODULES UNDER TEST
 * ============================================================
 */

const { checkEligibility } = require('../src/memory/memoryEligibility');
const memoryDeduplicator = require('../src/memory/memoryDeduplicator');
const memoryManager = require('../src/memory/memoryManager');
const memoryExtractor = require('../src/memory/memoryExtractor');

/**
 * ============================================================
 * TEST HARNESS
 * ============================================================
 */

let passCount = 0;
let failCount = 0;

function ok(label, condition, detail) {
    if (condition) {
        passCount += 1;
        console.log(`  ✅ ${label}`);
    } else {
        failCount += 1;
        console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function section(title) {
    console.log('');
    console.log(`=== ${title} ===`);
    console.log('');
}

/**
 * ============================================================
 * 1. ELIGIBILITY - general factual statements + hedged claims
 * ============================================================
 * Before this change, NOTHING in memoryEligibility.js covered plain
 * third-person factual statements at all - "The Pacific Ocean is the
 * largest ocean on Earth." scored 0 and could never reach extraction,
 * regardless of how good the extractor/knowledgeLibrary layer was.
 */
async function testEligibility() {
    section('1. Memory Eligibility — declarative facts + hedged claims');

    const facts = [
        'The Pacific Ocean is the largest ocean on Earth.',
        "Earth's largest ocean is the Pacific Ocean.",
        'Python was created by Guido van Rossum.',
        'Mars has two moons.',
        'HTTP is a protocol used for web communication.'
    ];

    for (const msg of facts) {
        const result = await checkEligibility(msg);
        ok(
            `declarative fact is eligible: "${msg}"`,
            result.eligible === true,
            `score=${result.score} signals=${JSON.stringify(result.matchedSignals)}`
        );
    }

    // Plan §17 Test G's own example.
    const hedged = [
        'I suspect this API uses OAuth.',
        'I believe the deploy happens automatically on push.'
    ];

    for (const msg of hedged) {
        const result = await checkEligibility(msg);
        ok(
            `hedged claim is eligible: "${msg}"`,
            result.eligible === true && result.matchedSignals.includes('hedged_claim'),
            `score=${result.score} signals=${JSON.stringify(result.matchedSignals)}`
        );
    }

    const negativeControls = [
        'Hey how are you doing today',
        'That is cool',
        'ok thanks',
        'Can you help me with something?'
    ];

    for (const msg of negativeControls) {
        const result = await checkEligibility(msg);
        ok(
            `non-factual message stays ineligible: "${msg}"`,
            result.eligible === false,
            `score=${result.score} signals=${JSON.stringify(result.matchedSignals)}`
        );
    }

    // Regression: a question about a fact must still be blocked by
    // the question gate even though it now also matches
    // declarative_fact (starts with a capital letter, contains "is").
    const question = await checkEligibility('What is the capital of France?');
    ok(
        'a real question is still blocked by the question gate despite matching declarative_fact',
        question.eligible === false,
        JSON.stringify(question)
    );
}

/**
 * ============================================================
 * 2. CANONICAL IDENTITY — category + subject + key
 * ============================================================
 * Regression test for the bug this session found and fixed:
 * memoryDeduplicator's knowledge branch previously used only
 * subject + key, meaning science/earth/natural_satellite and
 * geography/earth/natural_satellite would have incorrectly collided
 * as "the same identity".
 * ============================================================
 */
function testCanonicalIdentity() {
    section('2. Canonical Identity — knowledge_category is part of identity');

    const scienceFact = {
        category: 'knowledge',
        knowledge_category: 'science',
        subject: 'earth',
        key: 'natural_satellite',
        value: 'Moon'
    };

    const geographyFact = {
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'earth',
        key: 'natural_satellite',
        value: 'Moon (geography framing)'
    };

    const scienceIdentity = memoryDeduplicator.getMemoryIdentity(scienceFact);
    const geographyIdentity = memoryDeduplicator.getMemoryIdentity(geographyFact);

    ok(
        'two knowledge memories with the same subject+key but different knowledge_category get DIFFERENT identities',
        JSON.stringify(scienceIdentity) !== JSON.stringify(geographyIdentity),
        `science=${JSON.stringify(scienceIdentity)} geography=${JSON.stringify(geographyIdentity)}`
    );

    ok(
        'identity correctly carries category/subject/key',
        scienceIdentity.category === 'science' &&
        scienceIdentity.subject === 'earth' &&
        scienceIdentity.key === 'natural_satellite',
        JSON.stringify(scienceIdentity)
    );

    const missingCategory = memoryDeduplicator.getMemoryIdentity({
        category: 'knowledge',
        subject: 'earth',
        key: 'natural_satellite',
        value: 'Moon'
    });

    ok(
        'omitting knowledge_category defaults identity to "general" (matches knowledgeLibrary.js\'s own default)',
        missingCategory.category === 'general',
        JSON.stringify(missingCategory)
    );
}

/**
 * ============================================================
 * 3. PLAN §17 TESTS A-G — through the real memoryManager pipeline
 * ============================================================
 */
async function testPlanScenarios() {
    section('3. Plan §17 Tests A–G — insert/duplicate/update/refresh via memoryManager');

    fakeKnowledgeLibrary._reset();

    // --- Test A: New knowledge -> INSERT ---
    const testA = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['oceans', 'earth'],
        key: 'size_rank',
        value: 'The Pacific Ocean is the largest ocean on Earth.',
        type: 'fact',
        source_type: 'conversation',
        confidence: 0.95
    }]);

    ok(
        'Test A: new knowledge → saved (insert)',
        testA.action === 'saved' && testA.memories.length === 1,
        JSON.stringify(testA)
    );

    const afterA = await fakeKnowledgeLibrary.find('geography', 'pacific_ocean', 'size_rank');
    ok(
        'Test A: row exists with correct fields',
        Boolean(afterA) &&
        afterA.category === 'geography' &&
        afterA.subject === 'pacific_ocean' &&
        afterA.type === 'fact' &&
        afterA.confidence === 0.95,
        JSON.stringify(afterA)
    );

    // --- Test B: same canonical identity, same (already-canonicalized)
    // value -> DUPLICATE/REFRESH, not a second row.
    //
    // NOTE: resolving two DIFFERENTLY-WORDED sentences ("The Pacific
    // Ocean is..." vs "Earth's largest ocean is...") to the same
    // category+subject+key AND the same canonical value text is the
    // EXTRACTOR's semantic job (explicitly an LLM/canonicalization
    // concern per the plan, same as procedural memory's key
    // canonicalization already is) - not something the deterministic
    // dedup layer does or should do by comparing raw wording. This
    // tests the layer that actually sits below that: given the
    // extractor has already produced the same identity + value twice
    // (which is what "the model canonicalized both sentences the
    // same way" looks like once it reaches this layer), confirm it's
    // treated as a refresh, not a duplicate row.
    const testB = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['oceans'],
        key: 'size_rank',
        value: 'The Pacific Ocean is the largest ocean on Earth.',
        type: 'fact',
        source_type: 'conversation',
        confidence: 0.9
    }]);

    ok(
        'Test B: identical fact restated → duplicate (not a second insert)',
        testB.action === 'duplicate' && testB.duplicates.length === 1,
        JSON.stringify(testB)
    );

    const allAfterB = await fakeKnowledgeLibrary.getAll();
    ok(
        'Test B: still exactly one row for this identity',
        allAfterB.filter(r => r.category === 'geography' && r.subject === 'pacific_ocean' && r.key === 'size_rank').length === 1,
        JSON.stringify(allAfterB)
    );

    const afterB = await fakeKnowledgeLibrary.find('geography', 'pacific_ocean', 'size_rank');

    // Confidence is a real, non-timing-dependent check that the
    // refresh actually happened. updated_at is NOT compared against
    // a pre-Test-B snapshot here - both calls can land in the same
    // millisecond in a fast in-process test (Date.toISOString() has
    // only ms resolution), which would make this flaky for reasons
    // that have nothing to do with whether a refresh occurred.
    // fakeWriteLog (populated by the same upsertKnowledge() call path
    // memoryManager.js actually calls) is the reliable signal: it
    // records one entry per write, so an 'upsert(refresh)' entry
    // existing at all proves the duplicate path issued a write,
    // regardless of clock resolution.
    ok(
        'Test B (plan §6 DUPLICATE/REFRESH): confidence still refreshed even though value is unchanged',
        afterB.confidence === 0.9,
        JSON.stringify(afterB)
    );

    ok(
        'Test B (plan §6 DUPLICATE/REFRESH): the duplicate path issued an actual upsert write, not a silent no-op',
        fakeWriteLog.some(entry => entry.op === 'upsert(refresh)'),
        JSON.stringify(fakeWriteLog.map(e => e.op))
    );

    // --- Test C: new fact about the SAME subject, different key -> INSERT ---
    const testC = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['oceans', 'depth'],
        key: 'max_depth',
        value: 'The Mariana Trench, in the Pacific Ocean, is the deepest known point on Earth.',
        type: 'fact',
        source_type: 'conversation'
    }]);

    ok(
        'Test C: new key on an existing subject → insert (different canonical identity)',
        testC.action === 'saved' && testC.memories.length === 1,
        JSON.stringify(testC)
    );

    const allAfterC = await fakeKnowledgeLibrary.getBySubject('geography', 'pacific_ocean');
    ok(
        'Test C: subject now has two distinct records (size_rank and max_depth)',
        allAfterC.length === 2,
        JSON.stringify(allAfterC)
    );

    // --- Test D: same identity, materially different value -> durable review ---
    const testD = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['oceans'],
        key: 'size_rank',
        value: 'The Pacific Ocean covers more than 30% of the Earth\'s surface, making it the largest ocean.',
        type: 'fact',
        source_type: 'conversation',
        confidence: 0.97
    }]);

    ok(
        'Test D: materially different value at same identity → review (not overwritten)',
        testD.action === 'conflict' && testD.conflicts[0].review_id === 1 && testD.memories.length === 0,
        JSON.stringify(testD)
    );

    const afterD = await fakeKnowledgeLibrary.find('geography', 'pacific_ocean', 'size_rank');
    ok(
        'Test D: canonical value is unchanged',
        !afterD.value.includes('30%'),
        JSON.stringify(afterD)
    );

    const allAfterD = await fakeKnowledgeLibrary.getAll();
    ok(
        'Test D: no duplicate row created by the update',
        allAfterD.filter(r => r.category === 'geography' && r.subject === 'pacific_ocean' && r.key === 'size_rank').length === 1,
        JSON.stringify(allAfterD)
    );

    // --- Test E: different topics, same identity -> still one record ---
    const testE = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['records', 'superlatives'],
        key: 'size_rank',
        value: afterD.value,
        type: 'fact',
        source_type: 'conversation'
    }]);

    ok(
        'Test E: same identity + same value but different topics → duplicate, not a new record',
        testE.action === 'duplicate',
        JSON.stringify(testE)
    );

    const afterE = await fakeKnowledgeLibrary.find('geography', 'pacific_ocean', 'size_rank');
    ok(
        'Test E: duplicate refresh retains claim-supported topics and rejects unsupported additions',
        JSON.stringify(afterE.topics) === JSON.stringify(['oceans', 'earth']),
        JSON.stringify(afterE)
    );

    // --- Test F: different source, same identity -> one record, provenance updated ---
    const testF = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'geography',
        subject: 'pacific_ocean',
        topics: ['records'],
        key: 'size_rank',
        value: afterD.value,
        type: 'fact',
        source: 'user confirmed directly',
        source_type: 'user_statement'
    }]);

    ok(
        'Test F: same knowledge from a different source → still resolves to one canonical identity',
        testF.action === 'duplicate',
        JSON.stringify(testF)
    );

    const afterF = await fakeKnowledgeLibrary.find('geography', 'pacific_ocean', 'size_rank');
    ok(
        'Test F: provenance (source/source_type) was updated on the existing record',
        afterF.source === 'user confirmed directly' && afterF.source_type === 'user_statement',
        JSON.stringify(afterF)
    );

    const allAfterF = await fakeKnowledgeLibrary.getAll();
    ok(
        'Test F: still exactly one row for this identity across A, B, D, E, F',
        allAfterF.filter(r => r.category === 'geography' && r.subject === 'pacific_ocean' && r.key === 'size_rank').length === 1,
        JSON.stringify(allAfterF)
    );

    // --- Test G: assumption vs fact ---
    const testG = await memoryManager.handleMemoryAction([{
        category: 'knowledge',
        knowledge_category: 'technology',
        subject: 'some_api',
        topics: ['authentication'],
        key: 'auth_method',
        value: 'This API may use OAuth for authentication.',
        type: 'assumption',
        source_type: 'conversation',
        confidence: 0.4
    }]);

    ok(
        'Test G: hedged claim saves with type "assumption" (not silently coerced to fact)',
        testG.action === 'saved',
        JSON.stringify(testG)
    );

    const afterG = await fakeKnowledgeLibrary.find('technology', 'some_api', 'auth_method');
    ok(
        'Test G: stored row actually carries type: "assumption"',
        Boolean(afterG) && afterG.type === 'assumption',
        JSON.stringify(afterG)
    );
}

/**
 * ============================================================
 * 4. memoryExtractor.js — knowledge schema/prompt wiring
 * ============================================================
 */
async function testExtractorWiring() {
    section('4. memoryExtractor.js — knowledge fields wired into schema + defaulting');

    ok(
        'EXTRACTION_SCHEMA includes the knowledge-specific fields',
        ['knowledge_category', 'type', 'source', 'source_type'].every(
            f => f in memoryExtractor.EXTRACTION_SCHEMA.properties.memories.items.properties
        ),
        JSON.stringify(Object.keys(memoryExtractor.EXTRACTION_SCHEMA.properties.memories.items.properties))
    );

    // A response that omits type/source_type/confidence entirely -
    // deterministic post-parse defaulting (NOT another model call)
    // should fill them in.
    fakeCompleteImpl = async () => JSON.stringify({
        memories: [{
            category: 'knowledge',
            knowledge_category: 'science',
            subject: 'water',
            topics: ['chemistry'],
            key: 'chemical_formula',
            value: 'H2O'
        }],
        conversation_update: {}
    });

    const result = await memoryExtractor.extractMemory('Water is made of two hydrogen atoms and one oxygen atom.', {});
    const memory = result.memories[0];

    ok(
        'missing type defaults to "fact"',
        Boolean(memory) && memory.type === 'fact',
        JSON.stringify(memory)
    );

    ok(
        'missing source_type defaults to "conversation"',
        Boolean(memory) && memory.source_type === 'conversation',
        JSON.stringify(memory)
    );

    ok(
        'missing confidence defaults to 0.85 for knowledge',
        Boolean(memory) && memory.confidence === 0.85,
        JSON.stringify(memory)
    );

    // An explicitly-provided type must NOT be overridden by defaulting.
    fakeCompleteImpl = async () => JSON.stringify({
        memories: [{
            category: 'knowledge',
            knowledge_category: 'technology',
            subject: 'some_api',
            topics: ['authentication'],
            key: 'auth_method',
            value: 'This API may use OAuth for authentication.',
            type: 'assumption',
            confidence: 0.4
        }],
        conversation_update: {}
    });

    const resultG = await memoryExtractor.extractMemory('I suspect this API uses OAuth.', {});
    const memoryG = resultG.memories[0];

    ok(
        'explicit type: "assumption" is preserved, not overwritten by defaulting',
        Boolean(memoryG) && memoryG.type === 'assumption' && memoryG.confidence === 0.4,
        JSON.stringify(memoryG)
    );
}

/**
 * ============================================================
 * RUN
 * ============================================================
 */
async function run() {
    console.log('');
    console.log('=== Knowledge Memory Architecture Audit ===');

    try {
        await testEligibility();
        testCanonicalIdentity();
        await testPlanScenarios();
        await testExtractorWiring();
    } catch (error) {
        console.error('');
        console.error('❌ Audit crashed unexpectedly:');
        console.error(error);
        process.exitCode = 1;
        return;
    }

    console.log('');
    console.log(`=== Results: ${passCount} passed, ${failCount} failed ===`);
    console.log('');

    if (failCount > 0) {
        process.exitCode = 1;
    }
}

run();
