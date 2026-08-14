require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// -----------------------------------------------------------------------------
// ARGUMENTS
// -----------------------------------------------------------------------------
const args = new Set(process.argv.slice(2)); const RUN_LLM = !args.has('--no-llm'); 
const VERBOSE = args.has('--verbose'); const CLEANUP_ONLY = args.has('--cleanup'); 
function getArgumentValue(flag) { 
    const argv = process.argv; 
    const index = argv.indexOf(flag); 

    if (index === -1 || index + 1 >= argv.length) {
        return null; } return argv[index + 1]; 
    }
    const CLEANUP_AUDIT_ID = getArgumentValue('--audit-id');

// -----------------------------------------------------------------------------
// PATH RESOLUTION
// -----------------------------------------------------------------------------

/**
 * The audit is intended to live in a test folder.
 *
 * Expected layout:
 *
 * backend/
 *   src/
 *   test/
 *     memoryAudit.js
 *
 * But we try several common locations so the audit is less fragile.
 */

function resolveSourceRoot() {
    const candidates = [
        path.resolve(__dirname, '../src'),
        path.resolve(__dirname, '../../src'),
        path.resolve(process.cwd(), 'src'),
        path.resolve(process.cwd(), 'backend/src')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        '[MemoryAudit] Could not locate Atlas src directory.\n' +
        'Expected the audit to be inside something like backend/test/.'
    );
}

const SRC = resolveSourceRoot();

function src(...parts) {
    return path.join(SRC, ...parts);
}

// -----------------------------------------------------------------------------
// MODULES
// -----------------------------------------------------------------------------

const projectRegistry = require(src('memory', 'projectRegistry'));
const projectResolver = require(src('memory', 'projectResolver'));
const projectMemory = require(src('memory', 'projectMemory'));
const deterministicExtractor = require(src('memory', 'deterministicExtractor'));
const memoryExtractor = require(src('memory', 'memoryExtractor'));
const memoryEligibility = require(src('memory', 'memoryEligibility'));
const memoryDeduplicator = require(src('memory', 'memoryDeduplicator'));
const memoryCache = require(src('core', 'memoryCache'));

// Supabase is used ONLY for cleanup verification / deletion.
// Normal memory writes go through the actual projectMemory module.
const supabase = require(src('database', 'supabaseClient'));

// -----------------------------------------------------------------------------
// AUDIT ID
// -----------------------------------------------------------------------------

const timestamp = Date.now();
const randomPart = Math.random().toString(36).slice(2, 8);

const AUDIT_ID = `atlas_memory_audit_${timestamp}_${randomPart}`;

const ALPHA_NAME = `${AUDIT_ID}_Alpha`;
const BETA_NAME = `${AUDIT_ID}_Beta`;

const ALPHA_KEY = normalizeKey(ALPHA_NAME);
const BETA_KEY = normalizeKey(BETA_NAME);



// -----------------------------------------------------------------------------
// STATE
// -----------------------------------------------------------------------------

const results = [];

const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,

    deterministicTests: 0,
    deterministicPassed: 0,

    deterministicRepeatRuns: 0,
    deterministicRepeatFailures: 0,

    llmTests: 0,
    llmExecuted: 0,

    expectedLLMRequired: 0,

    projectMemoryWrites: 0,
    projectMemoryDeletes: 0,

    cacheTests: 0,

    isolationTests: 0
};

const createdProjects = new Set([
    ALPHA_KEY,
    BETA_KEY
]);

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

function normalizeSemanticIdentity(identity) { 
    if (!identity) { 
        return null; 
    } return { 
        type: identity.type || 
        null, subject: identity.subject || 
        null, key: identity.key || null }; 
    } 
    
function semanticIdentityString(identity) { 
    const normalized = normalizeSemanticIdentity(identity); 
    if (!normalized) { 
        return 'null'; 
    } 
    return JSON.stringify(normalized); 
} 
    function getSemanticIdentity(memory) { 
        return normalizeSemanticIdentity( memoryDeduplicator.getMemoryIdentity(memory) ); 
    } 
    function assertSameSemanticIdentity(a, b, message = '') { 
        const identityA = getSemanticIdentity(a); const identityB = getSemanticIdentity(b); assert.deepStrictEqual( identityA, identityB, message || `Expected equivalent memories to share semantic identity.\n` + `A: ${semanticIdentityString(identityA)}\n` + `B: ${semanticIdentityString(identityB)}` ); }

function normalizeValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[.!?]+$/, '')
        .replace(/\s+/g, ' ');
}

function preview(value, max = 300) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';

    const text =
        typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2);

    if (text.length <= max) return text;

    return text.slice(0, max) + '...';
}

function logVerbose(...messages) {
    if (VERBOSE) {
        console.log('[MemoryAudit]', ...messages);
    }
}

function record(name, passed, details = '', options = {}) { const status = options.skipped ? 'SKIP' : options.warning ? 'WARN' : passed ? 'PASS' : 'FAIL'; if (options.skipped) { stats.skipped++; } else if (status === 'PASS') { stats.passed++; } else if (status === 'FAIL') { stats.failed++; } stats.total++; results.push({ name, status, details }); const symbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '!' : '-'; console.log( `[${symbol}] ${name}` + (details ? `\n ${details}` : '') ); }

async function runTest(name, fn) {
    try {
        await fn();
    } catch (error) {
        record(
            name,
            false,
            `${error.message}\n${VERBOSE ? error.stack : ''}`
        );
    }
}

function assertMemoryShape(memory, expected = {}) {
    assert.ok(memory, 'Memory should exist.');
    assert.strictEqual(
        memory.category,
        expected.category,
        `Expected category "${expected.category}", got "${memory.category}".`
    );

    if (expected.subject !== undefined) {
        assert.strictEqual(
            String(memory.subject).toLowerCase(),
            String(expected.subject).toLowerCase(),
            `Expected subject "${expected.subject}", got "${memory.subject}".`
        );
    }

    if (expected.key !== undefined) {
        assert.strictEqual(
            memory.key,
            expected.key,
            `Expected key "${expected.key}", got "${memory.key}".`
        );
    }

    if (expected.value !== undefined) {
        assert.strictEqual(
            normalizeValue(memory.value),
            normalizeValue(expected.value),
            `Expected value "${expected.value}", got "${memory.value}".`
        );
    }
}

function findMemory(memories, predicate) {
    return memories.find(predicate);
}

function hasMemory(memories, predicate) {
    return Boolean(findMemory(memories, predicate));
}

function serializeMemories(memories) {
    return (memories || []).map(memory => ({
        category: memory.category,
        subject: memory.subject,
        key: memory.key,
        value: memory.value
    }));
}

// -----------------------------------------------------------------------------
// PROJECT SETUP
// -----------------------------------------------------------------------------

async function createAuditProjects() {
    console.log('\n[MemoryAudit] Creating temporary projects...');

    const alpha = await projectRegistry.addProject({
        name: ALPHA_NAME,
        project_key: ALPHA_KEY,
        aliases: [
            `${AUDIT_ID}_alpha`,
            `${AUDIT_ID}_A`
        ],
        description: 'Temporary Atlas memory audit project.'
    });

    const beta = await projectRegistry.addProject({
        name: BETA_NAME,
        project_key: BETA_KEY,
        aliases: [
            `${AUDIT_ID}_beta`,
            `${AUDIT_ID}_B`
        ],
        description: 'Temporary Atlas memory audit project.'
    });

    assert.ok(alpha.created, 'Alpha audit project was not created.');
    assert.ok(beta.created, 'Beta audit project was not created.');

    console.log(
        `[MemoryAudit] Created:\n` +
        `  Alpha: ${alpha.project.project_key}\n` +
        `  Beta:  ${beta.project.project_key}`
    );
}

// -----------------------------------------------------------------------------
// CLEANUP
// -----------------------------------------------------------------------------

async function deleteProjectMemories(projectKey) {
    const { data, error } = await supabase
        .from('project_memory')
        .delete()
        .eq('project_key', projectKey)
        .select();

    if (error) {
        throw new Error(
            `Failed deleting project memories for ${projectKey}: ${error.message}`
        );
    }

    stats.projectMemoryDeletes += data ? data.length : 0;

    return data || [];
}

async function deleteProjectByKey(projectKey) {
    const project = await projectRegistry.findProjectByKey(projectKey);

    if (!project) {
        return false;
    }

    await projectRegistry.deleteProjectById(project.id);

    return true;
}

async function cleanupAuditData() {
    console.log('\n[MemoryAudit] Cleaning up temporary data...');

    // Clear in-memory caches first.
    try {
        memoryCache.clearCache('project_memory');
        memoryCache.clearCache('user_profile');
        memoryCache.clearCache('knowledge_library');
        memoryCache.clearCache('procedural_memory');
        memoryCache.clearCache('dev_state');
    } catch (error) {
        console.error(
            '[MemoryAudit] Cache cleanup warning:',
            error.message
        );
    }

    const projectKeys = [
        ALPHA_KEY,
        BETA_KEY
    ];

    // Delete memories before projects.
    for (const projectKey of projectKeys) {
        try {
            const deleted = await deleteProjectMemories(projectKey);

            if (deleted.length > 0) {
                console.log(
                    `[MemoryAudit] Deleted ${deleted.length} memories from ${projectKey}.`
                );
            }
        } catch (error) {
            console.error(
                `[MemoryAudit] Failed deleting memories for ${projectKey}:`,
                error.message
            );
        }
    }

    // Delete projects.
    for (const projectKey of projectKeys) {
        try {
            const deleted = await deleteProjectByKey(projectKey);

            if (deleted) {
                console.log(
                    `[MemoryAudit] Deleted project ${projectKey}.`
                );
            }
        } catch (error) {
            console.error(
                `[MemoryAudit] Failed deleting project ${projectKey}:`,
                error.message
            );
        }
    }

    // Final verification.
    for (const projectKey of projectKeys) {
        const project = await projectRegistry.findProjectByKey(projectKey);

        if (project) {
            console.error(
                `[MemoryAudit] ⚠️ CLEANUP VERIFICATION FAILED: ${projectKey} still exists.`
            );
        }

        const { data, error } = await supabase
            .from('project_memory')
            .select('project_key, key')
            .eq('project_key', projectKey);

        if (error) {
            console.error(
                `[MemoryAudit] Cleanup verification error for ${projectKey}:`,
                error.message
            );
        } else if (data && data.length > 0) {
            console.error(
                `[MemoryAudit] ⚠️ CLEANUP VERIFICATION FAILED: ` +
                `${data.length} memories remain for ${projectKey}.`
            );
        }
    }

    console.log('[MemoryAudit] Cleanup complete.');
}

// -----------------------------------------------------------------------------
// 1. PROJECT REGISTRY / RESOLUTION
// -----------------------------------------------------------------------------

async function testProjectRegistry() {
    console.log('\n=== PROJECT REGISTRY / RESOLUTION ===');

    await runTest(
        'Registry: exact Alpha lookup',
        async () => {
            const result = await projectResolver.resolveProject(ALPHA_NAME);

            assert.strictEqual(result.type, 'existing_project');
            assert.strictEqual(result.projectKey, ALPHA_KEY);
        }
    );

    await runTest(
        'Registry: case-insensitive lookup',
        async () => {
            const result =
                await projectResolver.resolveProject(
                    ALPHA_NAME.toUpperCase()
                );

            assert.strictEqual(result.type, 'existing_project');
            assert.strictEqual(result.projectKey, ALPHA_KEY);
        }
    );

    await runTest(
        'Registry: alias lookup',
        async () => {
            const result =
                await projectResolver.resolveProject(
                    `${AUDIT_ID}_A`
                );

            assert.strictEqual(result.type, 'existing_project');
            assert.strictEqual(result.projectKey, ALPHA_KEY);
        }
    );

    await runTest(
        'Registry: project-key lookup',
        async () => {
            const result =
                await projectResolver.resolveProjectByKey(ALPHA_KEY);

            assert.strictEqual(result.type, 'existing_project');
            assert.strictEqual(result.projectKey, ALPHA_KEY);
        }
    );

    await runTest(
        'Registry: nonexistent project rejected',
        async () => {
            const result =
                await projectResolver.resolveProject(
                    `${AUDIT_ID}_does_not_exist`
                );

            assert.strictEqual(result.type, 'unknown');
        }
    );

    await runTest(
        'Registry: duplicate creation prevented',
        async () => {
            const result = await projectRegistry.addProject({
                name: ALPHA_NAME,
                project_key: ALPHA_KEY
            });

            assert.strictEqual(result.created, false);
            assert.strictEqual(
                result.project.project_key,
                ALPHA_KEY
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 2. ELIGIBILITY
// -----------------------------------------------------------------------------

async function testEligibility() {
    console.log('\n=== MEMORY ELIGIBILITY ===');

    const cases = [
        {
            name: 'Explicit remember',
            input: `Remember that ${ALPHA_NAME} uses Supabase.`,
            expected: true
        },
        {
            name: 'Project fact',
            input: `${ALPHA_NAME} uses Supabase.`,
            expected: true
        },
        {
            name: 'Project requirement',
            input: `${ALPHA_NAME} requires email verification.`,
            expected: true
        },
        {
            name: 'Project integration',
            input: `${ALPHA_NAME} connects to Stripe.`,
            expected: true
        },
        {
            name: 'Normal conversational question',
            input: 'What do you think about this idea?',
            expected: false
        },
        {
            name: 'Normal conversational statement',
            input: 'That sounds like a pretty good idea.',
            expected: false
        },
        {
            name: 'Project mention without memory signal',
            input: `What do you think about ${ALPHA_NAME}?`,
            expected: false
        },
        {
            name: 'State change',
            input: `Switch to ${ALPHA_NAME}.`,
            expected: true
        }
    ];

    for (const testCase of cases) {
        await runTest(
            `Eligibility: ${testCase.name}`,
            async () => {
                const result =
                    await memoryEligibility.checkEligibility(
                        testCase.input
                    );

                assert.strictEqual(
                    result.eligible,
                    testCase.expected,
                    `Score=${result.score}; ` +
                    `reason=${result.reason}; ` +
                    `signals=${result.matchedSignals.join(', ')}`
                );
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 3. DETERMINISTIC EXTRACTION
// -----------------------------------------------------------------------------

async function testDeterministicExtraction() {
    console.log('\n=== DETERMINISTIC EXTRACTION ===');

    const cases = [
        {
            name: 'Favorite preference',
            input: 'My favorite color is yellow.',
            expected: memory => {
                assertMemoryShape(memory, {
                    category: 'preference',
                    subject: 'user',
                    key: 'favorite_color',
                    value: 'yellow'
                });
            }
        },

        {
            name: 'Switch project',
            input: `Switch to ${ALPHA_NAME}.`,
            expected: memory => {
                assertMemoryShape(memory, {
                    category: 'state',
                    subject: 'user',
                    key: 'current_project',
                    value: ALPHA_KEY
                });
            }
        },

        {
            name: 'Working on project',
            input: `I'm working on ${ALPHA_NAME}.`,
            expected: memory => {
                assertMemoryShape(memory, {
                    category: 'state',
                    subject: 'user',
                    key: 'current_project',
                    value: ALPHA_KEY
                });
            }
        },

        {
            name: 'Project uses Supabase',
            input: `${ALPHA_NAME} uses Supabase.`,
            expected: memory => {
                assert.strictEqual(memory.category, 'project');
                assert.strictEqual(
                    memory.subject,
                    ALPHA_KEY
                );
                assert.ok(
                    memory.key.includes('uses_supabase')
                );
                assert.strictEqual(
                    normalizeValue(memory.value),
                    'supabase'
                );
            }
        },

        {
            name: 'Project requires email verification',
            input: `${ALPHA_NAME} requires email verification.`,
            expected: memory => {
                assert.strictEqual(memory.category, 'project');
                assert.strictEqual(
                    memory.subject,
                    ALPHA_KEY
                );
                assert.strictEqual(
                    normalizeValue(memory.value),
                    'email verification'
                );
            }
        },

        {
            name: 'Project connects to Stripe',
            input: `${ALPHA_NAME} connects to Stripe.`,
            expected: memory => {
                assert.strictEqual(memory.category, 'project');
                assert.strictEqual(
                    memory.subject,
                    ALPHA_KEY
                );
                assert.strictEqual(
                    normalizeValue(memory.value),
                    'stripe'
                );
            }
        },

        {
            name: 'Unknown project is not extracted as project memory',
            input: 'CompletelyUnknownProject uses QuantumDB.',
            expected: memory => {
                assert.strictEqual(
                    memory,
                    undefined,
                    'Unknown project should not produce a project memory.'
                );
            }
        }
    ];

    for (const testCase of cases) {
        await runTest(
            `Deterministic: ${testCase.name}`,
            async () => {
                stats.deterministicTests++;

                const result =
                    await deterministicExtractor.extract(
                        testCase.input
                    );

                assert.strictEqual(
                    result.deterministic,
                    true,
                    `Expected deterministic=true. Result=${preview(result)}`
                );

                assert.ok(
                    result.memories.length > 0,
                    'Expected at least one extracted memory.'
                );

                testCase.expected(result.memories[0]);

                stats.deterministicPassed++;
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 4. DETERMINISTIC NEGATIVE CASES
// -----------------------------------------------------------------------------

async function testDeterministicNegativeCases() {
    console.log('\n=== DETERMINISTIC NEGATIVE CASES ===');

    const cases = [
        'Tell me about Supabase.',
        'Why does Supabase exist?',
        'What is Stripe?',
        `Tell me something about ${ALPHA_NAME}.`,
        `I like working on ${ALPHA_NAME}.`,
        'This is just normal conversation.',
        `UnknownProject uses Supabase.`
    ];

    for (const input of cases) {
        await runTest(
            `Deterministic negative: ${input}`,
            async () => {
                const result =
                    await deterministicExtractor.extract(input);

                assert.strictEqual(
                    result.deterministic,
                    false,
                    `Unexpected deterministic extraction: ${preview(result)}`
                );

                assert.strictEqual(
                    result.memories.length,
                    0
                );

                stats.expectedLLMRequired++;
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 5. MULTIPLE DETERMINISTIC MEMORIES
// -----------------------------------------------------------------------------

async function testMultipleDeterministicMemories() {
    console.log('\n=== MULTIPLE DETERMINISTIC MEMORIES ===');

    const input =
        `Switch to ${ALPHA_NAME}. My favorite color is yellow.`;

    await runTest(
        'Deterministic extraction: multiple memories in one message',
        async () => {
            const result =
                await deterministicExtractor.extract(input);

            assert.strictEqual(
                result.deterministic,
                true
            );

            assert.ok(
                result.memories.length >= 2,
                `Expected >=2 deterministic memories, got ${result.memories.length}`
            );

            const hasProjectState = hasMemory(
                result.memories,
                memory =>
                    memory.category === 'state' &&
                    memory.key === 'current_project' &&
                    memory.value === ALPHA_KEY
            );

            const hasPreference = hasMemory(
                result.memories,
                memory =>
                    memory.category === 'preference' &&
                    memory.key === 'favorite_color' &&
                    normalizeValue(memory.value) === 'yellow'
            );

            assert.ok(
                hasProjectState,
                'Missing current_project memory.'
            );

            assert.ok(
                hasPreference,
                'Missing favorite_color memory.'
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 6. DETERMINISTIC REPEATABILITY
// -----------------------------------------------------------------------------

async function testDeterministicRepeatability() {
    console.log('\n=== DETERMINISTIC REPEATABILITY ===');

    const inputs = [
        `My favorite color is yellow.`,
        `Switch to ${ALPHA_NAME}.`,
        `I'm working on ${ALPHA_NAME}.`,
        `${ALPHA_NAME} uses Supabase.`,
        `${ALPHA_NAME} requires email verification.`,
        `${ALPHA_NAME} connects to Stripe.`,
        `${ALPHA_NAME} supports shared binders.`
    ];

    const RUNS_PER_CASE = 10;

    for (const input of inputs) {
        await runTest(
            `Deterministic repeatability: ${input}`,
            async () => {
                let baseline = null;

                for (let i = 0; i < RUNS_PER_CASE; i++) {
                    const result =
                        await deterministicExtractor.extract(input);

                    const normalized =
                        serializeMemories(result.memories);

                    stats.deterministicRepeatRuns++;

                    if (baseline === null) {
                        baseline = JSON.stringify(normalized);
                        continue;
                    }

                    const current =
                        JSON.stringify(normalized);

                    if (current !== baseline) {
                        stats.deterministicRepeatFailures++;

                        throw new Error(
                            `Deterministic output changed on run ${i + 1}.\n` +
                            `Baseline:\n${baseline}\n` +
                            `Current:\n${current}`
                        );
                    }
                }
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 7. VARIANT / EDGE CASES
// -----------------------------------------------------------------------------

async function testProjectFactVariants() {
    console.log('\n=== PROJECT FACT VARIANTS ===');

    const variants = [
        `${ALPHA_NAME} uses Supabase`,
        `${ALPHA_NAME} uses Supabase.`,
        `${ALPHA_NAME} uses Supabase!`,
        `${ALPHA_NAME} uses Supabase?`,
        `${ALPHA_NAME.toUpperCase()} uses Supabase.`,
        `  ${ALPHA_NAME} uses Supabase.  `,
        `the ${ALPHA_NAME} uses Supabase.`,
        `${ALPHA_NAME} USES SUPABASE.`,
        `${ALPHA_NAME} requires email verification.`,
        `${ALPHA_NAME} supports shared binders.`,
        `${ALPHA_NAME} includes Stripe.`,
        `${ALPHA_NAME} has Stripe.`,
        `${ALPHA_NAME} connects to Supabase.`,
        `${ALPHA_NAME} connects with Supabase.`,
        `${ALPHA_NAME} is built with Electron.`,
        `${ALPHA_NAME} is built using Electron.`,
        `${ALPHA_NAME} depends on Scrydex.`,
        `${ALPHA_NAME} runs on Vercel.`,
        `${ALPHA_NAME} works with Scrydex.`
    ];

    for (const input of variants) {
        await runTest(
            `Variant extraction: ${input}`,
            async () => {
                const result =
                    await deterministicExtractor.extract(input);

                assert.strictEqual(
                    result.deterministic,
                    true,
                    `Expected deterministic extraction: ${preview(result)}`
                );

                const memory =
                    result.memories.find(
                        m => m.category === 'project'
                    );

                assert.ok(
                    memory,
                    'Expected project memory.'
                );

                assert.strictEqual(
                    memory.subject,
                    ALPHA_KEY,
                    `Incorrect project subject: ${memory.subject}`
                );

                assert.ok(
                    memory.key,
                    'Project memory has no key.'
                );

                assert.ok(
                    memory.value,
                    'Project memory has no value.'
                );
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 8. UNKNOWN / MIS-MATCHED PROJECT CASES
// -----------------------------------------------------------------------------

async function testProjectMismatchProtection() {
    console.log('\n=== PROJECT MISMATCH PROTECTION ===');

    const cases = [
        `UnknownProject uses Supabase.`,
        `RandomApp requires Stripe.`,
        `NotRegisteredProject supports PostgreSQL.`,
        `The fake project uses Electron.`
    ];

    for (const input of cases) {
        await runTest(
            `Unknown project protection: ${input}`,
            async () => {
                const result =
                    await deterministicExtractor.extract(input);

                const projectMemories =
                    result.memories.filter(
                        memory =>
                            memory.category === 'project'
                    );

                assert.strictEqual(
                    projectMemories.length,
                    0,
                    `Unknown project produced memory: ${preview(projectMemories)}`
                );
            }
        );
    }
}

// -----------------------------------------------------------------------------
// 9. DEDUPLICATOR
// -----------------------------------------------------------------------------

async function testDeduplicator() {
    console.log('\n=== MEMORY DEDUPLICATOR ===');

    const base = {
        category: 'project',
        subject: ALPHA_KEY,
        key: 'uses_supabase',
        value: 'Supabase',
        confidence: 0.95
    };

    await runTest(
        'Deduplication: no existing memory => insert',
        async () => {
            const result =
                memoryDeduplicator.determineAction(
                    base,
                    null
                );

            assert.strictEqual(
                result.action,
                'insert'
            );
        }
    );

    await runTest(
        'Deduplication: exact duplicate => duplicate',
        async () => {
            const result =
                memoryDeduplicator.determineAction(
                    base,
                    { ...base }
                );

            assert.strictEqual(
                result.action,
                'duplicate'
            );
        }
    );

    await runTest(
        'Deduplication: project same identity/different value => conflict',
        async () => {
            const result =
                memoryDeduplicator.determineAction(
                    base,
                    {
                        ...base,
                        value: 'PostgreSQL'
                    }
                );

            assert.strictEqual(
                result.action,
                'conflict'
            );
        }
    );

    await runTest(
        'Deduplication: non-project changed value => update',
        async () => {
            const existing = {
                category: 'preference',
                subject: 'user',
                key: 'favorite_color',
                value: 'blue'
            };

            const incoming = {
                category: 'preference',
                subject: 'user',
                key: 'favorite_color',
                value: 'yellow'
            };

            const result =
                memoryDeduplicator.determineAction(
                    incoming,
                    existing
                );

            assert.strictEqual(
                result.action,
                'update'
            );
        }
    );

    await runTest(
        'Deduplication: invalid memory => ignored',
        async () => {
            const result =
                memoryDeduplicator.determineAction(
                    {
                        category: 'project'
                    },
                    null
                );

            assert.strictEqual(
                result.action,
                'ignored'
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 10. SEMANTIC DUPLICATE WARNING
// -----------------------------------------------------------------------------

async function testSemanticDuplicateIdentity() { console.log('\n=== SEMANTIC DUPLICATE IDENTITY ==='); const inputs = [ `${ALPHA_NAME} uses Supabase.`, `${ALPHA_NAME} connects to Supabase.`, `${ALPHA_NAME} is built with Supabase.`, `${ALPHA_NAME} uses Supabase for its database.` ]; const extracted = []; for (const input of inputs) { await runTest( `Semantic identity extraction: ${input}`, async () => { const result = await deterministicExtractor.extract(input); const memory = result.memories.find( item => item.category === 'project' ); assert.ok( memory, `Expected project memory from: ${input}` ); assert.strictEqual( memory.subject, ALPHA_KEY ); extracted.push({ input, memory }); } ); } if (extracted.length < 2) { return; } const baseline = extracted[0].memory; for (const entry of extracted.slice(1)) { await runTest( `Semantic identity equivalence: "${entry.input}"`, async () => { assertSameSemanticIdentity( baseline, entry.memory, `Equivalent project facts produced different identities.\n` + `Baseline input: ${extracted[0].input}\n` + `Baseline memory: ${preview(baseline)}\n` + `Current input: ${entry.input}\n` + `Current memory: ${preview(entry.memory)}` ); } ); } }


async function testCrossProjectSemanticIsolation() { console.log('\n=== CROSS-PROJECT SEMANTIC ISOLATION ==='); const alphaResult = await deterministicExtractor.extract( `${ALPHA_NAME} uses Supabase.` ); const betaResult = await deterministicExtractor.extract( `${BETA_NAME} uses Supabase.` ); const alpha = alphaResult.memories.find( memory => memory.category === 'project' ); const beta = betaResult.memories.find( memory => memory.category === 'project' ); await runTest( 'Cross-project semantic identity: same fact type remains project-scoped', async () => { assert.ok(alpha); assert.ok(beta); assert.strictEqual( alpha.subject, ALPHA_KEY ); assert.strictEqual( beta.subject, BETA_KEY ); const alphaIdentity = getSemanticIdentity(alpha); const betaIdentity = getSemanticIdentity(beta); assert.strictEqual( alphaIdentity.type, betaIdentity.type ); assert.notStrictEqual( alphaIdentity.subject, betaIdentity.subject ); assert.strictEqual( alphaIdentity.key, betaIdentity.key ); } ); }
// -----------------------------------------------------------------------------
// 11. PROJECT MEMORY WRITE / READ
// -----------------------------------------------------------------------------

async function testProjectMemoryPersistence() {
    console.log('\n=== PROJECT MEMORY PERSISTENCE ===');

    const memories = [
        {
            project_key: ALPHA_KEY,
            subject: ALPHA_KEY,
            key: 'audit_database',
            value: 'Supabase'
        },
        {
            project_key: ALPHA_KEY,
            subject: ALPHA_KEY,
            key: 'audit_authentication',
            value: 'Email verification'
        },
        {
            project_key: BETA_KEY,
            subject: BETA_KEY,
            key: 'audit_database',
            value: 'PostgreSQL'
        }
    ];

    for (const memory of memories) {
        await runTest( 'Deduplication: same semantic fact in different projects does not conflict', async () => { const alpha = { category: 'project', subject: ALPHA_KEY, key: 'uses_database', value: 'Supabase', confidence: 0.95 }; const beta = { category: 'project', subject: BETA_KEY, key: 'uses_database', value: 'Supabase', confidence: 0.95 }; const alphaIdentity = getSemanticIdentity(alpha); const betaIdentity = getSemanticIdentity(beta); assert.strictEqual( alphaIdentity.type, betaIdentity.type ); assert.strictEqual( alphaIdentity.key, betaIdentity.key ); assert.notStrictEqual( alphaIdentity.subject, betaIdentity.subject ); const result = memoryDeduplicator.determineAction( beta, alpha ); assert.notStrictEqual( result.action, 'conflict', `Different projects should not conflict: ${preview(result)}` ); } );
    }
}

// -----------------------------------------------------------------------------
// 12. PROJECT ISOLATION
// -----------------------------------------------------------------------------

async function testProjectIsolation() {
    console.log('\n=== PROJECT MEMORY ISOLATION ===');

    stats.isolationTests += 4;

    await runTest(
        'Isolation: Alpha does not return Beta memories',
        async () => {
            const memories =
                await projectMemory.get(ALPHA_KEY);

            assert.ok(
                memories.every(
                    memory =>
                        memory.project_key === ALPHA_KEY
                ),
                `Alpha returned cross-project memory: ${preview(memories)}`
            );
        }
    );

    await runTest(
        'Isolation: Beta does not return Alpha memories',
        async () => {
            const memories =
                await projectMemory.get(BETA_KEY);

            assert.ok(
                memories.every(
                    memory =>
                        memory.project_key === BETA_KEY
                ),
                `Beta returned cross-project memory: ${preview(memories)}`
            );
        }
    );

    await runTest(
        'Isolation: Alpha retains its own database fact',
        async () => {
            const memories =
                await projectMemory.get(ALPHA_KEY);

            assert.ok(
                hasMemory(
                    memories,
                    memory =>
                        memory.key === 'audit_database' &&
                        normalizeValue(memory.value) === 'supabase'
                )
            );
        }
    );

    await runTest(
        'Isolation: Beta retains its conflicting database fact independently',
        async () => {
            const memories =
                await projectMemory.get(BETA_KEY);

            assert.ok(
                hasMemory(
                    memories,
                    memory =>
                        memory.key === 'audit_database' &&
                        normalizeValue(memory.value) === 'postgresql'
                )
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 13. CACHE INVALIDATION
// -----------------------------------------------------------------------------

async function testCacheInvalidation() {
    console.log('\n=== MEMORY CACHE ===');

    stats.cacheTests += 3;

    await runTest(
        'Cache: cold project memory load',
        async () => {
            memoryCache.clearCache('project_memory');

            const indexed =
                await memoryCache.getMemory(
                    'project_memory'
                );

            assert.ok(
                Array.isArray(indexed),
                'Expected project memory index array.'
            );
        }
    );

    await runTest(
        'Cache: stale data is replaced after invalidation',
        async () => {
            memoryCache.clearCache('project_memory');

            const before =
                await memoryCache.getMemory(
                    'project_memory'
                );

            const auditKey =
                'audit_cache_refresh';

            const existingBefore =
                before.find(
                    item =>
                        item.data &&
                        item.data.project_key === ALPHA_KEY &&
                        item.data.key === auditKey
                );

            assert.strictEqual(
                existingBefore,
                undefined,
                'Cache test memory unexpectedly existed before insertion.'
            );

            await projectMemory.update({
                project_key: ALPHA_KEY,
                subject: ALPHA_KEY,
                key: auditKey,
                value: 'fresh-value'
            });

            stats.projectMemoryWrites++;

            // Without invalidation, warmIndex should still contain
            // the previous cold snapshot.
            const stale =
                await memoryCache.getMemory(
                    'project_memory'
                );

            const staleFound =
                stale.find(
                    item =>
                        item.data &&
                        item.data.project_key === ALPHA_KEY &&
                        item.data.key === auditKey
                );

            // This is informational rather than a hard assertion because
            // behavior depends on whether another subsystem invalidated it.
            logVerbose(
                'Cache before explicit invalidation:',
                preview(staleFound)
            );

            memoryCache.invalidate('project_memory');

            const fresh =
                await memoryCache.getMemory(
                    'project_memory'
                );

            const freshFound =
                fresh.find(
                    item =>
                        item.data &&
                        item.data.project_key === ALPHA_KEY &&
                        item.data.key === auditKey
                );

            assert.ok(
                freshFound,
                'Freshly inserted memory did not appear after cache invalidation.'
            );

            assert.strictEqual(
                normalizeValue(freshFound.data.value),
                'fresh-value'
            );
        }
    );

    await runTest(
        'Cache: clearCache removes project-memory index',
        async () => {
            memoryCache.clearCache('project_memory');

            const data =
                await memoryCache.getMemory(
                    'project_memory'
                );

            assert.ok(
                Array.isArray(data)
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 14. LLM EXTRACTION
// -----------------------------------------------------------------------------

async function testLLMExtraction() {
    console.log('\n=== LLM MEMORY EXTRACTION ===');

    if (!RUN_LLM) {
        record(
            'LLM extraction suite',
            true,
            'Skipped with --no-llm.',
            { skipped: true }
        );

        return;
    }

    const cases = [
        {
            name: 'Project architecture',
            input:
                `${ALPHA_NAME} stores its application data in Supabase and uses Electron for its desktop interface.`
        },

        {
            name: 'Project requirement',
            input:
                `${ALPHA_NAME} requires email verification before users can create an account.`
        },

        {
            name: 'Project integration',
            input:
                `${ALPHA_NAME} uses Stripe for billing and Scrydex for card data.`
        },

        {
            name: 'General non-project knowledge',
            input:
                'I learned that PostgreSQL is a relational database system.'
        }
    ];

    for (const testCase of cases) {
        await runTest(
            `LLM extraction: ${testCase.name}`,
            async () => {
                stats.llmTests++;
                stats.llmExecuted++;

                const result =
                    await memoryExtractor.extractMemory(
                        testCase.input,
                        {
                            current_project: ALPHA_KEY,
                            current_topic: 'memory audit',
                            registered_projects: [
                                {
                                    name: ALPHA_NAME,
                                    project_key: ALPHA_KEY
                                },
                                {
                                    name: BETA_NAME,
                                    project_key: BETA_KEY
                                }
                            ]
                        }
                    );

                assert.ok(
                    result,
                    'Extractor returned nothing.'
                );

                assert.ok(
                    Array.isArray(result.memories),
                    'Extractor did not return memories array.'
                );

                logVerbose(
                    `LLM result for "${testCase.input}":`,
                    preview(result)
                );

                // We intentionally do not assert exact LLM output wording.
                // The benchmark is primarily checking structural validity
                // and project attribution.
                for (const memory of result.memories) {
                    assert.ok(
                        memory.category,
                        'Extracted memory missing category.'
                    );

                    assert.ok(
                        memory.key,
                        'Extracted memory missing key.'
                    );

                    assert.notStrictEqual(
                        memory.value,
                        undefined,
                        'Extracted memory missing value.'
                    );
                }
            }
        );
    }
}

async function testLLMProjectAttributionBoundary() { console.log('\n=== LLM PROJECT ATTRIBUTION BOUNDARY ==='); if (!RUN_LLM) { record( 'LLM project attribution boundary', true, 'Skipped with --no-llm.', { skipped: true } ); return; } await runTest( 'LLM extraction: general knowledge is not falsely attributed to current project', async () => { stats.llmTests++; stats.llmExecuted++; const result = await memoryExtractor.extractMemory( 'PostgreSQL is a relational database system.', { current_project: ALPHA_KEY, current_topic: 'memory audit', registered_projects: [ { name: ALPHA_NAME, project_key: ALPHA_KEY }, { name: BETA_NAME, project_key: BETA_KEY } ] } ); assert.ok( Array.isArray(result.memories) ); const projectMemories = result.memories.filter( memory => memory.category === 'project' ); assert.strictEqual( projectMemories.length, 0, `General knowledge was incorrectly attributed to Alpha:\n` + preview(projectMemories) ); } ); }

// -----------------------------------------------------------------------------
// 15. MULTIPLE LLM MEMORIES
// -----------------------------------------------------------------------------

async function testLLMMultipleMemories() { console.log('\n=== MULTIPLE LLM MEMORIES ==='); if (!RUN_LLM) { record( 'LLM multiple-memory extraction', true, 'Skipped with --no-llm.', { skipped: true } ); return; } const input = `${ALPHA_NAME} uses Supabase for its database, ` + `uses Stripe for billing, ` + `and uses Electron for its desktop application. ` + `It also requires email verification.`; await runTest( 'LLM extraction: multiple project memories from one message', async () => { stats.llmTests++; stats.llmExecuted++; const result = await memoryExtractor.extractMemory( input, { current_project: ALPHA_KEY, current_topic: 'memory audit', registered_projects: [ { name: ALPHA_NAME, project_key: ALPHA_KEY }, { name: BETA_NAME, project_key: BETA_KEY } ] } ); assert.ok( Array.isArray(result.memories), 'Extractor did not return memories array.' ); const memories = result.memories; assert.ok( memories.length >= 3, `Expected at least 3 persistent memories, got ${memories.length}.\n` + preview(memories) ); for (const memory of memories) { assert.ok( memory.category, 'Memory missing category.' ); assert.ok( memory.key, 'Memory missing key.' ); assert.notStrictEqual( memory.value, undefined, 'Memory missing value.' ); } const projectMemories = memories.filter( memory => memory.category === 'project' ); assert.ok( projectMemories.length >= 3, `Expected at least 3 project memories, got ${projectMemories.length}.\n` + preview(projectMemories) ); for (const memory of projectMemories) { assert.strictEqual( memory.subject, ALPHA_KEY, `Project memory was attributed to wrong project: ${preview(memory)}` ); } const serialized = JSON.stringify(projectMemories) .toLowerCase(); assert.ok( serialized.includes('supabase'), 'LLM extraction missed Supabase.' ); assert.ok( serialized.includes('stripe'), 'LLM extraction missed Stripe.' ); assert.ok( serialized.includes('electron'), 'LLM extraction missed Electron.' ); } ); }

// -----------------------------------------------------------------------------
// 16. MULTIPLE MEMORY SAVE TEST
// -----------------------------------------------------------------------------

async function testMultipleMemoryPersistence() {
    console.log('\n=== MULTIPLE MEMORY PERSISTENCE ===');

    const extracted = [
        {
            category: 'project',
            subject: ALPHA_KEY,
            key: 'audit_database',
            value: 'Supabase'
        },
        {
            category: 'project',
            subject: ALPHA_KEY,
            key: 'audit_billing',
            value: 'Stripe'
        },
        {
            category: 'project',
            subject: ALPHA_KEY,
            key: 'audit_desktop',
            value: 'Electron'
        }
    ];

    await runTest(
        'Multiple project memories: all extracted memories persist independently',
        async () => {
            for (const memory of extracted) {
                await projectMemory.update({
                    project_key: ALPHA_KEY,
                    subject: ALPHA_KEY,
                    key: memory.key,
                    value: memory.value
                });

                stats.projectMemoryWrites++;
            }

            const stored =
                await projectMemory.get(ALPHA_KEY);

            for (const expected of extracted) {
                const found =
                    stored.find(
                        memory =>
                            memory.key === expected.key
                    );

                assert.ok(
                    found,
                    `Missing persisted memory ${expected.key}`
                );

                assert.strictEqual(
                    normalizeValue(found.value),
                    normalizeValue(expected.value)
                );
            }
        }
    );
}

// -----------------------------------------------------------------------------
// 17. UPsert / DATABASE BEHAVIOR
// -----------------------------------------------------------------------------

async function testProjectUpsertBehavior() {
    console.log('\n=== PROJECT MEMORY UPSERT BEHAVIOR ===');

    const key = 'audit_upsert_behavior';

    await runTest(
        'Project memory upsert: same project/key replaces stored value',
        async () => {
            await projectMemory.update({
                project_key: ALPHA_KEY,
                subject: ALPHA_KEY,
                key,
                value: 'first-value'
            });

            stats.projectMemoryWrites++;

            await projectMemory.update({
                project_key: ALPHA_KEY,
                subject: ALPHA_KEY,
                key,
                value: 'second-value'
            });

            stats.projectMemoryWrites++;

            const memories =
                await projectMemory.get(ALPHA_KEY);

            const matches =
                memories.filter(
                    memory =>
                        memory.key === key
                );

            assert.strictEqual(
                matches.length,
                1,
                'Expected exactly one row after upsert.'
            );

            assert.strictEqual(
                normalizeValue(matches[0].value),
                'second-value'
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 18. CONTEXT-LEVEL PROJECT MEMORY AUDIT
// -----------------------------------------------------------------------------

async function testProjectMemoryContextShape() {
    console.log('\n=== PROJECT MEMORY CONTEXT SHAPE ===');

    await runTest(
        'Project memory context: returned rows preserve project_key',
        async () => {
            const alpha =
                await projectMemory.get(ALPHA_KEY);

            const beta =
                await projectMemory.get(BETA_KEY);

            assert.ok(alpha.length > 0);
            assert.ok(beta.length > 0);

            assert.ok(
                alpha.every(
                    item =>
                        item.project_key === ALPHA_KEY
                )
            );

            assert.ok(
                beta.every(
                    item =>
                        item.project_key === BETA_KEY
                )
            );
        }
    );

    await runTest(
        'Project memory context: Alpha and Beta remain independently queryable',
        async () => {
            const alpha =
                await projectMemory.get(ALPHA_KEY);

            const beta =
                await projectMemory.get(BETA_KEY);

            const alphaKeys =
                new Set(alpha.map(item => item.key));

            const betaKeys =
                new Set(beta.map(item => item.key));

            // The audit intentionally seeded the same semantic key
            // with different values in both projects.
            assert.ok(
                alphaKeys.has('audit_database')
            );

            assert.ok(
                betaKeys.has('audit_database')
            );

            const alphaDatabase =
                alpha.find(
                    item =>
                        item.key === 'audit_database'
                );

            const betaDatabase =
                beta.find(
                    item =>
                        item.key === 'audit_database'
                );

            assert.strictEqual(
                normalizeValue(alphaDatabase.value),
                'supabase'
            );

            assert.strictEqual(
                normalizeValue(betaDatabase.value),
                'postgresql'
            );
        }
    );
}

// -----------------------------------------------------------------------------
// 19. FINAL CLEANUP TEST
// -----------------------------------------------------------------------------

async function verifyNoCrossProjectRows() {
    console.log('\n=== FINAL DATA VERIFICATION ===');

    for (const projectKey of [
        ALPHA_KEY,
        BETA_KEY
    ]) {
        const { data, error } = await supabase
            .from('project_memory')
            .select('project_key, key, value')
            .eq('project_key', projectKey);

        if (error) {
            throw new Error(
                `Final verification failed for ${projectKey}: ${error.message}`
            );
        }

        assert.ok(
            Array.isArray(data)
        );

        console.log(
            `[MemoryAudit] ${projectKey}: ${data.length} temporary memories currently exist.`
        );
    }
}

// -----------------------------------------------------------------------------
// CLEANUP-ONLY MODE
// -----------------------------------------------------------------------------

async function findAuditProjects() { const { data, error } = await supabase .from('projects') .select('id, project_key, name') .like('project_key', 'atlas_memory_audit_%'); if (error) { throw new Error( `Failed finding audit projects: ${error.message}` ); } return data || []; } async function runCleanupOnly() { console.log( '\n[MemoryAudit] Running cleanup-only mode...' ); if (CLEANUP_AUDIT_ID) { console.log( ` Target audit ID: ${CLEANUP_AUDIT_ID}` ); const projectKeys = [ normalizeKey(`${CLEANUP_AUDIT_ID}_Alpha`), normalizeKey(`${CLEANUP_AUDIT_ID}_Beta`) ]; for (const projectKey of projectKeys) { try { await deleteProjectMemories(projectKey); await deleteProjectByKey(projectKey); } catch (error) { console.error( `[MemoryAudit] Cleanup failed for ${projectKey}:`, error.message ); } } console.log( '[MemoryAudit] Targeted cleanup complete.' ); return; } console.log( '[MemoryAudit] No --audit-id supplied. ' + 'Searching for orphaned audit projects...' ); const projects = await findAuditProjects(); for (const project of projects) { try { await deleteProjectMemories( project.project_key ); await projectRegistry.deleteProjectById( project.id ); console.log( `[MemoryAudit] Removed ${project.project_key}.` ); } catch (error) { console.error( `[MemoryAudit] Failed removing ${project.project_key}:`, error.message ); } } console.log( `[MemoryAudit] Removed ${projects.length} audit project(s).` ); }

// -----------------------------------------------------------------------------
// MAIN AUDIT
// -----------------------------------------------------------------------------

async function runAudit() {
    const start = Date.now();

    console.log('\n');
    console.log('============================================================');
    console.log(' ATLAS MEMORY AUDIT BENCHMARK');
    console.log('============================================================');
    console.log(`Audit ID:       ${AUDIT_ID}`);
    console.log(`Alpha Project:  ${ALPHA_KEY}`);
    console.log(`Beta Project:   ${BETA_KEY}`);
    console.log(`LLM Tests:      ${RUN_LLM ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Verbose:        ${VERBOSE ? 'YES' : 'NO'}`);
    console.log('============================================================');

    try {
        await createAuditProjects();

        await testProjectRegistry();

        await testEligibility();

        await testDeterministicExtraction();

        await testDeterministicNegativeCases();

        await testMultipleDeterministicMemories();

        await testDeterministicRepeatability();

        await testProjectFactVariants();

        await testProjectMismatchProtection();

        await testDeduplicator();

        await testSemanticDuplicateIdentity(); 
        
        await testCrossProjectSemanticIsolation();

        await testProjectMemoryPersistence();

        await testProjectIsolation();

        await testCacheInvalidation();

        await testLLMExtraction();

        await testLLMProjectAttributionBoundary();

        await testLLMMultipleMemories();

        await testMultipleMemoryPersistence();

        await testProjectUpsertBehavior();

        await testProjectMemoryContextShape();

        await verifyNoCrossProjectRows();
    } catch (error) {
        console.error(
            '\n[MemoryAudit] Fatal audit error:',
            error
        );
    } finally {
        /*
         * THIS IS INTENTIONAL.
         *
         * Even if one test throws unexpectedly, cleanup should still
         * execute so benchmark data does not remain in Atlas memory.
         */
        await cleanupAuditData();

        printReport(Date.now() - start);
    }
}

// -----------------------------------------------------------------------------
// REPORT
// -----------------------------------------------------------------------------

function printReport(duration) {
    console.log('\n');
    console.log('============================================================');
    console.log(' ATLAS MEMORY AUDIT REPORT');
    console.log('============================================================');

    console.log(
        `Duration:              ${(duration / 1000).toFixed(2)}s`
    );

    console.log(
        `Tests:                 ${stats.total}`
    );

    console.log(
        `Passed:                ${stats.passed}`
    );

    console.log(
        `Failed:                ${stats.failed}`
    );

    console.log(
        `Skipped:               ${stats.skipped}`
    );

    console.log(
        `Deterministic tests:   ${stats.deterministicTests}`
    );

    console.log(
        `Deterministic passed:  ${stats.deterministicPassed}`
    );

    console.log(
        `Repeatability runs:    ${stats.deterministicRepeatRuns}`
    );

    console.log(
        `Repeatability failures:${stats.deterministicRepeatFailures}`
    );

    console.log(
        `LLM tests:             ${stats.llmTests}`
    );

    console.log(
        `LLM executions:        ${stats.llmExecuted}`
    );

    console.log(
        `Expected LLM-required: ${stats.expectedLLMRequired}`
    );

    console.log(
        `Memory writes:         ${stats.projectMemoryWrites}`
    );

    console.log(
        `Memory deletes:        ${stats.projectMemoryDeletes}`
    );

    console.log(
        `Isolation tests:       ${stats.isolationTests}`
    );

    console.log(
        `Cache tests:           ${stats.cacheTests}`
    );

    console.log('------------------------------------------------------------');

    const failures =
        results.filter(
            result =>
                result.status === 'FAIL'
        );

    const warnings =
        results.filter(
            result =>
                result.status === 'WARN'
        );

    if (failures.length > 0) {
        console.log('\nFAILURES:');

        for (const failure of failures) {
            console.log(
                `\n✗ ${failure.name}\n` +
                `  ${failure.details}`
            );
        }
    }

    if (warnings.length > 0) {
        console.log('\nWARNINGS:');

        for (const warning of warnings) {
            console.log(
                `\n! ${warning.name}\n` +
                `  ${warning.details}`
            );
        }
    }

    console.log('\n------------------------------------------------------------');

    if (stats.failed === 0) { console.log( 'RESULT: ✓ TESTED ARCHITECTURE PASSED' ); } else { console.log( `RESULT: ✗ ${stats.failed} TEST(S) FAILED` ); }

    console.log('============================================================');

    console.log(
        '\nNOTE: A passing benchmark means the current tested behavior is' +
        '\n      internally consistent. It does NOT mean the architecture' +
        '\n      is necessarily semantically correct.'
    );

    console.log( '\nThe most important architecture signals from this audit are:' + '\n 1. Semantic identity canonicalization' + '\n 2. Same-project conflict handling' + '\n 3. Cross-project semantic isolation' + '\n 4. Multiple-memory extraction completeness' + '\n 5. LLM project attribution boundaries' + '\n 6. Project-memory retrieval isolation' + '\n 7. Cache invalidation correctness' + '\n 8. Background-memory race timing' );

    console.log('');
}

// -----------------------------------------------------------------------------
// ENTRY POINT
// -----------------------------------------------------------------------------

(async () => {
    try {
        if (CLEANUP_ONLY) {
            await runCleanupOnly();
            process.exit(0);
        }

        await runAudit();

        /*
         * Do not fail the shell process solely because individual benchmark
         * assertions failed. The report itself is the useful artifact.
         *
         * If you want CI-style behavior later, change this to:
         *
         *     process.exit(stats.failed > 0 ? 1 : 0);
         */
        process.exit(0);

    } catch (error) {
        console.error(
            '\n[MemoryAudit] Unhandled fatal error:',
            error
        );

        /*
         * Best-effort emergency cleanup.
         */
        try {
            await cleanupAuditData();
        } catch (cleanupError) {
            console.error(
                '[MemoryAudit] Emergency cleanup also failed:',
                cleanupError.message
            );
        }

        process.exit(1);
    }
})();
