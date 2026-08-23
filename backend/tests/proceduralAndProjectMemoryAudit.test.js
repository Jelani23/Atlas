// backend/tests/proceduralAndProjectMemoryAudit.test.js
//
// Audit for the procedural-memory and project-memory pipelines:
// eligibility detection, deterministic fast-path extraction,
// semantic enrichment, and the background-memory LLM queue.
//
// This does NOT hit a live Supabase or Ollama instance - it fakes
// projectRegistry (the single choke point every project-lookup
// module goes through) and the model adapter, injected directly
// into require.cache before anything else loads them. That keeps
// this runnable anywhere without credentials while still exercising
// the real extraction/eligibility/enrichment code paths.
//
// Run with: node tests/proceduralAndProjectMemoryAudit.test.js

const path = require('path');

// A handful of modules transitively required by contextBuilder.js
// (e.g. longTermProfile.js, via contextManager.js -> memoryCache.js)
// construct a Supabase client at require time, even though nothing
// in this audit ever calls a method on it - real DB calls only
// happen through the faked modules below. This just lets those
// requires succeed without needing real credentials; if the caller
// already has a real .env loaded, those values win.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sandbox-placeholder-key';

/**
 * ============================================================
 * FAKES (installed before any real module can cache the real one)
 * ============================================================
 */

const FAKE_PROJECTS = [
    { id: 1, project_key: 'atlas', name: 'Atlas', aliases: ['atlas system', 'the atlas project'] },
    { id: 2, project_key: 'bindex', name: 'Bindex', aliases: [] },
    { id: 3, project_key: 'subsynq', name: 'SubSynq', aliases: ['sub synq'] }
];

function normalizeForFake(name) {
    return String(name || '')
        .trim()
        .replace(/[.!?]+$/, '')
        .replace(/\s+(now|right now|currently|again|today)$/i, '')
        .replace(/\s+(project)$/i, '')
        .toLowerCase();
}

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

installFakeModule('../src/memory/projectRegistry', {
    async getAllProjects() {
        return FAKE_PROJECTS;
    },
    async findProject(name) {
        const normalized = normalizeForFake(name);
        return FAKE_PROJECTS.find(p =>
            normalizeForFake(p.name) === normalized ||
            (p.aliases || []).some(a => normalizeForFake(a) === normalized)
        ) || null;
    },
    async findProjectByKey(key) {
        const normalized = normalizeForFake(key);
        return FAKE_PROJECTS.find(p => p.project_key === normalized) || null;
    },
    async projectExists(name) {
        return this.findProject ? (await this.findProject(name)) !== null : false;
    },
    async addProject() {
        throw new Error('addProject is not faked for this audit.');
    },
    async deleteProjectById() {
        throw new Error('deleteProjectById is not faked for this audit.');
    },
    normalizeProjectName: normalizeForFake,
    normalizeProjectKey: (k) => normalizeForFake(k).replace(/\s+/g, '-')
});

// Controllable fake model adapter - memoryExtractor.js and
// semanticEnricher.js both call createModelAdapter() at module load
// time and only ever use .complete(), so this is enough surface.
let fakeCompleteImpl = async () => '{"memories":[],"conversation_update":{}}';
let fakeCompleteCallLog = [];

installFakeModule('../src/models/modelAdapter', {
    createModelAdapter() {
        return {
            async complete(messages, options) {
                fakeCompleteCallLog.push({ messages, options, at: Date.now() });
                return fakeCompleteImpl(messages, options);
            }
            // streamComplete intentionally omitted - nothing under
            // test here uses it.
        };
    }
});

// worldModel.js talks to Supabase directly (not through the faked
// projectRegistry choke point), and contextBuilder.js pulls it in -
// fake it too so contextBuilder.js can be loaded and exercised for
// real without a live database.
installFakeModule('../src/memory/worldModel', {
    async getAll() {
        return null;
    }
});

/**
 * ============================================================
 * MODULES UNDER TEST (loaded only after the fakes are installed)
 * ============================================================
 */

const { checkEligibility } = require('../src/memory/memoryEligibility');
const { extractJSON } = require('../src/utils/jsonExtractor');
const deterministicExtractor = require('../src/memory/deterministicExtractor');
const semanticEnricher = require('../src/memory/semanticEnricher');
const memoryExtractor = require('../src/memory/memoryExtractor');
const llmQueue = require('../src/memory/llmQueue');
const { buildContext } = require('../src/core/contextBuilder');

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
 * 1. ELIGIBILITY - varied human phrasing for procedural teaching
 * ============================================================
 *
 * Before this change, there was no procedural signal category at
 * all - only "remember" / "from now on" (explicit_memory) or
 * "i always" / "i never" (identity, first-person only) could clear
 * the threshold. Ordinary second-person procedural teaching like
 * "whenever you..." or "you should always..." scored 0 and never
 * reached the extractor.
 */

async function testEligibility() {
    section('1. Memory Eligibility — procedural signal coverage');

    const casual = [
        'hey, whenever you explain something technical to me, break it down step by step',
        "next time I ask you to summarize something, just use bullet points ok?",
        'any time you write code for me, throw in some comments please',
        "yo, from here on out keep your answers shorter",
        "can you always ask before you delete a file? like, every time"
    ];

    const formal = [
        'Going forward, please format all code examples with syntax highlighting.',
        'You should always explain your reasoning before giving a final answer.',
        'You should never fabricate a file path that does not exist in the project.',
        'Please always confirm with me before running a destructive command.',
        'Please never use semicolons in code comments.',
        "Don't ever suggest deleting files without asking first.",
        'Every time I ask you to summarize something, use bullet points.',
        'When I ask for a summary, keep it under five sentences.',
        'When you explain code, use comments.'
    ];

    // Bare imperatives and lead-in-free phrasings - these have no
    // recognizable phrase in the SIGNALS list (no "you should",
    // "please", "make sure to" lead-in), but they're exactly what
    // the deterministic extractor's always_when/imperative_obligation/
    // prohibition/when_directed patterns are built to catch. This
    // reproduces the exact live-log failures: "Always double check
    // file paths before editing." and "Always explain your reasoning
    // before giving an answer." both scored 0 before this fix.
    const bareImperative = [
        'Always double check file paths before editing.',
        'Always explain your reasoning before giving an answer.',
        'Never use tabs instead of spaces.',
        'When you write code for me, add comments explaining each step.'
    ];

    const negativeControls = [
        'What is the capital of France?',
        'Can you help me fix this bug?',
        'ok thanks',
        'when I get home later I might work on this'
    ];

    for (const msg of casual.concat(formal).concat(bareImperative)) {
        const result = await checkEligibility(msg);
        ok(
            `procedural phrasing is eligible: "${msg}"`,
            result.eligible === true,
            `score=${result.score} signals=${JSON.stringify(result.matchedSignals)}`
        );
    }

    for (const msg of negativeControls) {
        const result = await checkEligibility(msg);
        ok(
            `non-procedural message stays ineligible: "${msg}"`,
            result.eligible === false,
            `score=${result.score} signals=${JSON.stringify(result.matchedSignals)}`
        );
    }

    // Regression: project-fact and explicit-memory eligibility must
    // still work exactly as before.
    const regression = await checkEligibility('Bindex uses Supabase for authentication.');
    ok(
        'regression: registered-project fact is still eligible',
        regression.eligible === true,
        `score=${regression.score}`
    );

    const explicitRegression = await checkEligibility('Remember that I prefer dark mode.');
    ok(
        'regression: explicit "remember" phrasing is still eligible',
        explicitRegression.eligible === true &&
        explicitRegression.matchedSignals.includes('explicit_memory'),
        `score=${explicitRegression.score}`
    );
}

/**
 * ============================================================
 * 2. DETERMINISTIC PROCEDURAL PATTERNS - pure pattern matching
 * ============================================================
 */

function testProceduralPatterns() {
    section('2. Deterministic Extractor — procedural fast-path patterns');

    const cases = [
        {
            label: 'conditional_trigger (whenever)',
            message: "Whenever you're explaining something technical to me, break it down step by step.",
            expectTriggerIncludes: 'you',
            expectActionIncludes: 'break it down'
        },
        {
            label: 'conditional_trigger (any time)',
            message: 'Any time I ask you to summarize something, use bullet points.',
            expectTriggerIncludes: 'i',
            expectActionIncludes: 'bullet points'
        },
        {
            label: 'conditional_trigger (every time)',
            message: 'Every time you write code, add comments explaining each step.',
            expectTriggerIncludes: 'you',
            expectActionIncludes: 'comments'
        },
        {
            label: 'when_directed',
            message: 'When you explain code, use comments.',
            expectTriggerIncludes: 'you',
            expectActionIncludes: 'use comments'
        },
        {
            label: 'when_directed (i-clause)',
            message: 'When I ask for a summary, keep it under five sentences.',
            expectTriggerIncludes: 'i',
            expectActionIncludes: 'five sentences'
        },
        {
            label: 'standing_rule (from now on)',
            message: 'From now on, use bullet points for long explanations.',
            expectTrigger: 'in general',
            expectActionIncludes: 'bullet points'
        },
        {
            label: 'standing_rule (going forward)',
            message: 'Going forward, keep your answers shorter.',
            expectTrigger: 'in general',
            expectActionIncludes: 'shorter'
        },
        {
            label: 'standing_rule (from here on out)',
            message: 'From here on out, always double check file paths before editing.',
            expectTrigger: 'in general'
        },
        {
            label: 'always_when',
            message: 'Always use bullet points when giving long explanations.',
            expectTriggerIncludes: 'giving long explanations',
            expectActionIncludes: 'bullet points'
        },
        {
            label: 'always (no trigger)',
            message: 'Always ask before deleting a file.',
            expectTrigger: 'in general'
        },
        {
            label: 'imperative_obligation (should always)',
            message: 'You should always explain your reasoning before giving an answer.',
            expectTrigger: 'in general',
            expectActionIncludes: 'always'
        },
        {
            label: 'imperative_obligation (should never)',
            message: "You should never make up file paths that don't exist.",
            expectTrigger: 'in general',
            expectActionIncludes: 'never'
        },
        {
            label: 'imperative_obligation (please always)',
            message: 'Please always confirm before deleting anything.',
            expectTrigger: 'in general',
            expectActionIncludes: 'always'
        },
        {
            label: 'imperative_obligation (please never)',
            message: 'Please never use semicolons in code comments.',
            expectTrigger: 'in general',
            expectActionIncludes: 'never'
        },
        {
            label: 'prohibition (dont ever)',
            message: "Don't ever suggest deleting files without asking first.",
            expectTrigger: 'in general',
            expectActionIncludes: 'never'
        },
        {
            label: 'prohibition (never)',
            message: 'Never format code without asking which language I want.',
            expectTrigger: 'in general',
            expectActionIncludes: 'never'
        }
    ];

    for (const testCase of cases) {
        let matched = null;
        let matchedPatternName = null;

        for (const pattern of deterministicExtractor.PROCEDURAL_FACT_PATTERNS) {
            const result = pattern.match(testCase.message);
            if (result) {
                matched = result;
                matchedPatternName = pattern.name;
                break;
            }
        }

        ok(
            `${testCase.label} → matched a pattern`,
            matched !== null,
            `message="${testCase.message}"`
        );

        if (!matched) continue;

        ok(
            `${testCase.label} → key/trigger/action all populated`,
            Boolean(matched.key && matched.trigger && matched.action),
            JSON.stringify(matched)
        );

        if (testCase.expectTrigger) {
            ok(
                `${testCase.label} → trigger === "${testCase.expectTrigger}"`,
                matched.trigger === testCase.expectTrigger,
                `got "${matched.trigger}"`
            );
        }

        if (testCase.expectTriggerIncludes) {
            ok(
                `${testCase.label} → trigger includes "${testCase.expectTriggerIncludes}"`,
                matched.trigger.includes(testCase.expectTriggerIncludes),
                `got "${matched.trigger}"`
            );
        }

        if (testCase.expectActionIncludes) {
            ok(
                `${testCase.label} → action includes "${testCase.expectActionIncludes}"`,
                matched.action.includes(testCase.expectActionIncludes),
                `got "${matched.action}"`
            );
        }
    }
}

/**
 * ============================================================
 * 3. FULL extract() — procedural sentences end-to-end
 * ============================================================
 */

async function testProceduralExtractEndToEnd() {
    section('3. Deterministic Extractor — extract() end-to-end (procedural)');

    const messages = [
        'Whenever you explain something technical to me, break it down step by step.',
        'From now on, use bullet points for long explanations.',
        'You should always ask before deleting a file.'
    ];

    for (const message of messages) {
        const result = await deterministicExtractor.extract(message);

        ok(
            `"${message}" → deterministic hit`,
            result.deterministic === true,
            JSON.stringify(result)
        );

        const memory = result.memories[0];

        ok(
            `"${message}" → category is "procedure"`,
            Boolean(memory) && memory.category === 'procedure'
        );

        ok(
            `"${message}" → flagged needs_semantic_enrichment (subject unresolved yet)`,
            Boolean(memory) && memory.needs_semantic_enrichment === true && memory.subject === null
        );

        ok(
            `"${message}" → has trigger, action, and a value combining them`,
            Boolean(memory) && Boolean(memory.trigger) && Boolean(memory.action) && Boolean(memory.value)
        );
    }
}

/**
 * ============================================================
 * 4. FULL extract() — project sentences, varied phrasing
 * (regression across the existing pattern families)
 * ============================================================
 */

async function testProjectExtractEndToEnd() {
    section('4. Deterministic Extractor — extract() end-to-end (project, regression)');

    const cases = [
        {
            label: 'relationship (uses ... for)',
            message: 'Bindex uses Supabase for authentication.',
            expectProjectKey: 'bindex'
        },
        {
            label: 'relationship (requires)',
            message: 'Atlas requires Node to run.',
            expectProjectKey: 'atlas'
        },
        {
            label: 'possession (has)',
            message: 'Atlas has a memory cache.',
            expectProjectKey: 'atlas'
        },
        {
            label: 'ownership (component handles X)',
            message: "Atlas's memory manager handles deduplication.",
            expectProjectKey: 'atlas'
        },
        {
            label: 'capability (can)',
            message: 'SubSynq can export subscriptions to CSV.',
            expectProjectKey: 'subsynq'
        },
        {
            label: 'configuration',
            message: 'Atlas is configured to use qwen3:4b as the default model.',
            expectProjectKey: 'atlas'
        },
        {
            label: 'observation wrapper',
            message: 'One thing I learned about Bindex is that it stores card images in Supabase storage.',
            expectProjectKey: 'bindex'
        },
        {
            label: 'nested relationship',
            message: 'The memory system inside Atlas uses a project memory cache.',
            expectProjectKey: 'atlas'
        }
    ];

    for (const testCase of cases) {
        const result = await deterministicExtractor.extract(testCase.message);
        const memory = result.memories[0];

        ok(
            `${testCase.label}: "${testCase.message}" → deterministic hit`,
            result.deterministic === true,
            JSON.stringify(result)
        );

        ok(
            `${testCase.label} → category "project", project_key "${testCase.expectProjectKey}"`,
            Boolean(memory) &&
            memory.category === 'project' &&
            memory.project_key === testCase.expectProjectKey,
            JSON.stringify(memory)
        );

        ok(
            `${testCase.label} → flagged needs_semantic_enrichment`,
            Boolean(memory) && memory.needs_semantic_enrichment === true
        );
    }

    // Regression: a sentence about an unregistered project should
    // not produce a memory at all.
    const unknownProject = await deterministicExtractor.extract(
        'RandomOtherApp uses MongoDB for storage.'
    );

    ok(
        'unregistered project fact is discarded, not hallucinated as a memory',
        unknownProject.deterministic === false && unknownProject.memories.length === 0,
        JSON.stringify(unknownProject)
    );
}

/**
 * ============================================================
 * 5. SEMANTIC ENRICHMENT — generalized project + procedure path
 * ============================================================
 */

async function testSemanticEnrichment() {
    section('5. Semantic Enricher — project + procedure enrichment');

    fakeCompleteImpl = async (messages) => {
        const prompt = messages[1].content;
        if (prompt.includes('RAW TRIGGER:')) {
            return '{"subject": "explanations", "topics": ["step_by_step", "technical_explanations", "coding"], "trigger": "when helping with coding or technical problems", "context": "technical_explanations"}';
        }
        return '{"subject": "authentication", "topics": ["supabase", "login"]}';
    };

    const projectMemory = {
        category: 'project',
        project_key: 'bindex',
        key: 'supabase',
        value: 'uses Supabase for authentication',
        semantic_hint: 'authentication',
        needs_semantic_enrichment: true
    };

    const enrichedProject = await semanticEnricher.enrichMemory(projectMemory);

    ok(
        'project memory gets enriched with subject + topics',
        enrichedProject.subject === 'authentication' &&
        Array.isArray(enrichedProject.topics) &&
        enrichedProject.topics.length > 0 &&
        enrichedProject.needs_semantic_enrichment === false,
        JSON.stringify(enrichedProject)
    );

    ok(
        'project enrichment call never overrides num_ctx (would force a model reload)',
        !fakeCompleteCallLog.some(call => call.options && 'context' in call.options),
        JSON.stringify(fakeCompleteCallLog.map(c => c.options))
    );

    // Deterministic extraction leaves procedures with no explicit
    // conditional as trigger: "in general" - enrichment must replace
    // that placeholder with a real, generalized condition, and must
    // also fill in context (which the deterministic fast-path never
    // sets at all).
    const procedureMemory = {
        category: 'procedure',
        key: 'break_it_down_step_by_step',
        value: 'When explaining technical concepts, break them down step by step.',
        trigger: 'in general',
        action: 'break it down step by step',
        context: null,
        needs_semantic_enrichment: true
    };

    const enrichedProcedure = await semanticEnricher.enrichMemory(procedureMemory);

    ok(
        'procedure memory ALSO gets subject + topics (previously project-only)',
        enrichedProcedure.subject === 'explanations' &&
        Array.isArray(enrichedProcedure.topics) &&
        enrichedProcedure.topics.length > 0 &&
        enrichedProcedure.needs_semantic_enrichment === false,
        JSON.stringify(enrichedProcedure)
    );

    ok(
        'procedure trigger is replaced with a generalized condition (not left as "in general")',
        enrichedProcedure.trigger === 'when helping with coding or technical problems' &&
        enrichedProcedure.trigger !== 'in general',
        JSON.stringify(enrichedProcedure)
    );

    ok(
        'procedure context is populated (was always null before)',
        Boolean(enrichedProcedure.context) && enrichedProcedure.context !== 'null',
        JSON.stringify(enrichedProcedure)
    );

    // If the model omits trigger/context, enrichment must not save a
    // half-enriched memory silently - fall back to the original so
    // it's still flagged needs_semantic_enrichment for a future pass,
    // rather than persisting nulls.
    fakeCompleteImpl = async () => '{"subject": "explanations", "topics": ["step_by_step"]}';

    const incompleteMemory = {
        category: 'procedure',
        key: 'incomplete_case',
        value: 'Do the thing.',
        trigger: 'in general',
        action: 'do the thing',
        needs_semantic_enrichment: true
    };

    const stillUnenriched = await semanticEnricher.enrichMemory(incompleteMemory);

    ok(
        'an incomplete enrichment response (missing trigger/context) leaves the memory unenriched rather than partially null',
        stillUnenriched.needs_semantic_enrichment === true && stillUnenriched === incompleteMemory,
        JSON.stringify(stillUnenriched)
    );

    fakeCompleteImpl = async (messages) => {
        const prompt = messages[1].content;
        if (prompt.includes('RAW TRIGGER:')) {
            return '{"subject": "explanations", "topics": ["step_by_step", "technical_explanations", "coding"], "trigger": "when helping with coding or technical problems", "context": "technical_explanations"}';
        }
        return '{"subject": "authentication", "topics": ["supabase", "login"]}';
    };

    const untouched = { category: 'preference', key: 'x', value: 'y', needs_semantic_enrichment: true };
    const passthrough = await semanticEnricher.enrichMemory(untouched);

    ok(
        'non-enrichable category (e.g. preference) passes through unchanged',
        passthrough === untouched
    );

    const batch = await semanticEnricher.enrichMemories([
        { ...projectMemory },
        { ...procedureMemory },
        { ...untouched }
    ]);

    ok(
        'enrichMemories() handles a mixed batch of project + procedure + other',
        batch.length === 3 &&
        batch[0].subject === 'authentication' &&
        batch[1].subject === 'explanations' &&
        batch[1].trigger === 'when helping with coding or technical problems' &&
        batch[2].needs_semantic_enrichment === true
    );
}

/**
 * ============================================================
 * 6. REASONING-LEAK ROBUSTNESS
 * ============================================================
 *
 * Live logs showed enrichment/extraction calls returning raw
 * reasoning prose ("We are given: ... Steps: 1. We must output...")
 * with NO <think> tags at all, and the JSON never appearing before
 * the response got cut off. Two things had to be fixed: (1) give
 * the model enough token budget to survive some reasoning and still
 * reach the JSON, and (2) make extractJSON robust to prose braces
 * appearing before the real JSON object even without <think> tags
 * to strip. This covers both directly, plus checks the actual
 * options/prompt sent to the model reflect the fix.
 */

async function testReasoningLeakRobustness() {
    section('6. Schema-Constrained Extraction — format wiring + graceful fallback');

    ok(
        'extractJSON still parses a clean, untagged JSON response (baseline)',
        extractJSON('{"subject": "coding", "topics": ["a", "b"]}')?.subject === 'coding'
    );

    ok(
        'extractJSON still works with proper <think>...</think> tags',
        extractJSON('<think>reasoning here</think>{"subject": "coding", "topics": ["a"]}')?.subject === 'coding'
    );

    // The actual observed failure mode: no <think> tags at all, and
    // the reasoning prose itself never mentions a stray brace before
    // the real JSON - this must keep working (it did before too).
    const reasoningNoTagsThenJSON =
        'We are given:\n  RAW TRIGGER: in general\n  ACTION: explain your reasoning\n\n' +
        'Steps:\n1. We must output ONE broad subject.\n2. Then topics.\n\n' +
        '{"subject": "explanations", "topics": ["reasoning", "step_by_step"], "trigger": "when helping with coding or technical problems", "context": "technical_explanations"}';

    const parsedAfterReasoning = extractJSON(reasoningNoTagsThenJSON);

    ok(
        'extractJSON finds the real JSON after untagged reasoning prose with no braces in it',
        parsedAfterReasoning?.subject === 'explanations' &&
        Array.isArray(parsedAfterReasoning.topics) &&
        parsedAfterReasoning.trigger === 'when helping with coding or technical problems',
        JSON.stringify(parsedAfterReasoning)
    );

    // Harder case: the reasoning prose itself contains stray braces
    // (e.g. the model describing the JSON shape conceptually) before
    // the real JSON object - naively pairing the very first '{' in
    // the whole text with the last '}' would grab a corrupted,
    // unbalanced span here.
    const reasoningWithStrayBraces =
        'I need to return an object like {subject, topics} based on the input, ' +
        'then reason step by step before answering.\n\n' +
        'Final answer: {"subject": "coding", "topics": ["debugging", "syntax"]}';

    const parsedDespiteStrayBraces = extractJSON(reasoningWithStrayBraces);

    ok(
        'extractJSON is not corrupted by stray braces in reasoning prose before the real JSON',
        parsedDespiteStrayBraces?.subject === 'coding' &&
        Array.isArray(parsedDespiteStrayBraces.topics) &&
        parsedDespiteStrayBraces.topics.includes('debugging'),
        JSON.stringify(parsedDespiteStrayBraces)
    );

    ok(
        'extractJSON still correctly returns null for pure reasoning with no JSON at all',
        extractJSON('We are given: RAW TRIGGER: in general. Steps: 1. First we consider the subject.') === null
    );

    // Now exercise the real enrichment + extraction calls end-to-end
    // with a fake model that reproduces the exact live-log failure
    // (unbounded reasoning prose, no JSON at all within the fake's
    // response) and confirm two things: (1) the schema-constraint
    // option is actually being sent on every call - that's the part
    // that was silently missing before, the plumbing existed in
    // ollama.js but nothing called it - and (2) even without that
    // guarantee in this fake (which can't enforce grammar-constrained
    // decoding the way real Ollama does), the code still fails
    // gracefully instead of crashing or saving a null/empty memory.
    fakeCompleteCallLog = [];
    fakeCompleteImpl = async (messages) => {
        const prompt = messages[1].content;
        if (prompt.includes('RAW TRIGGER:')) {
            return 'We are given:\n  RAW TRIGGER: in general\n  ACTION: explain your reasoning before giving an answer\n\n' +
                'Steps:\n1. Determine the subject.\n2. Determine topics.\n3. Determine a generalized trigger.\n4. Determine context.\n\n' +
                'This requires careful consideration of the behavioral domain...';
        }
        return 'We are given a project fact.\n\nSteps:\n1. Determine subject.\n2. Determine topics.\n\n' +
            'Let me think through what broad area this belongs to...';
    };

    const procedureFromLiveLog = {
        category: 'procedure',
        key: 'explain_your_reasoning_before_giving_an',
        value: 'Explain your reasoning before giving an answer to a problem.',
        trigger: 'in general',
        action: 'explain your reasoning before giving an answer to a problem',
        context: null,
        needs_semantic_enrichment: true
    };

    const stillUnenrichedFromLiveLog = await semanticEnricher.enrichMemory(procedureFromLiveLog);

    ok(
        'a response that is pure reasoning with NO JSON anywhere fails gracefully (stays unenriched, does not throw or save nulls)',
        stillUnenrichedFromLiveLog === procedureFromLiveLog &&
        stillUnenrichedFromLiveLog.needs_semantic_enrichment === true,
        JSON.stringify(stillUnenrichedFromLiveLog)
    );

    const projectFromLiveLog = {
        category: 'project',
        project_key: 'atlas',
        key: 'memory_manager',
        value: 'memory manager handles deduplication',
        semantic_hint: 'memory manager',
        needs_semantic_enrichment: true
    };

    const stillUnenrichedProjectFromLiveLog = await semanticEnricher.enrichMemory(projectFromLiveLog);

    ok(
        'same graceful-failure behavior for a project enrichment with no JSON in the response',
        stillUnenrichedProjectFromLiveLog === projectFromLiveLog &&
        stillUnenrichedProjectFromLiveLog.needs_semantic_enrichment === true,
        JSON.stringify(stillUnenrichedProjectFromLiveLog)
    );

    // This is the actual regression test for the real fix: every
    // enrichment call must carry `format: <schema>`, since that's
    // what makes the graceful-failure path above unreachable in
    // production - Ollama's decoder can't produce reasoning-only
    // output once a schema is attached, regardless of prompt wording
    // or how a given model/Ollama build honors `think: false`.
    ok(
        'every enrichment call carries format: PROJECT_ENRICHMENT_SCHEMA or PROCEDURE_ENRICHMENT_SCHEMA (not left unset)',
        fakeCompleteCallLog.length === 2 &&
        fakeCompleteCallLog.every(call => Boolean(call.options.format)),
        JSON.stringify(fakeCompleteCallLog.map(c => c.options.format))
    );

    const projectCall = fakeCompleteCallLog.find(c => c.messages[1].content.includes('PROJECT:'));
    const procedureCall = fakeCompleteCallLog.find(c => c.messages[1].content.includes('RAW TRIGGER:'));

    ok(
        'the project enrichment call\'s format schema is exactly semanticEnricher.PROJECT_ENRICHMENT_SCHEMA (not a hand-copied duplicate that can drift)',
        Boolean(projectCall) &&
        JSON.stringify(projectCall.options.format) === JSON.stringify(semanticEnricher.PROJECT_ENRICHMENT_SCHEMA),
        JSON.stringify(projectCall && projectCall.options.format)
    );

    ok(
        'the procedure enrichment call\'s format schema is exactly semanticEnricher.PROCEDURE_ENRICHMENT_SCHEMA, and requires trigger + context (not just subject/topics)',
        Boolean(procedureCall) &&
        JSON.stringify(procedureCall.options.format) === JSON.stringify(semanticEnricher.PROCEDURE_ENRICHMENT_SCHEMA) &&
        procedureCall.options.format.required.includes('trigger') &&
        procedureCall.options.format.required.includes('context'),
        JSON.stringify(procedureCall && procedureCall.options.format)
    );

    // Now confirm that with a WELL-FORMED schema-constrained response
    // (what `format` actually guarantees in production), the exact
    // live-log inputs enrich correctly end-to-end.
    fakeCompleteImpl = async (messages) => {
        const prompt = messages[1].content;
        if (prompt.includes('RAW TRIGGER:')) {
            return '{"subject": "reasoning", "topics": ["explanations", "step_by_step"], "trigger": "when helping with coding or technical problems", "context": "problem_solving"}';
        }
        return '{"subject": "memory", "topics": ["deduplication", "memory_manager"]}';
    };

    const enrichedFromLiveLog = await semanticEnricher.enrichMemory(procedureFromLiveLog);

    ok(
        'the exact live-log procedural input enriches correctly once the response is schema-conformant',
        enrichedFromLiveLog.subject === 'reasoning' &&
        enrichedFromLiveLog.topics.length > 0 &&
        enrichedFromLiveLog.trigger === 'when helping with coding or technical problems' &&
        Boolean(enrichedFromLiveLog.context) &&
        enrichedFromLiveLog.needs_semantic_enrichment === false,
        JSON.stringify(enrichedFromLiveLog)
    );

    const enrichedProjectFromLiveLog = await semanticEnricher.enrichMemory(projectFromLiveLog);

    ok(
        'the exact live-log project input enriches correctly once the response is schema-conformant',
        enrichedProjectFromLiveLog.subject === 'memory' &&
        enrichedProjectFromLiveLog.topics.length > 0 &&
        enrichedProjectFromLiveLog.needs_semantic_enrichment === false,
        JSON.stringify(enrichedProjectFromLiveLog)
    );

    // Same regression check, one level up: memoryExtractor's fallback
    // classifier call must carry a schema-constrained `format` too.
    //
    // Phase: this used to assert deep-equality against the static
    // EXTRACTION_SCHEMA constant. That constant now reflects the
    // no-registered-projects case only (buildExtractionSchema([])) -
    // extractMemory() builds the schema per-call via
    // buildExtractionSchema(projectKeys), constraining project_key to an
    // enum of whatever projects are actually registered right now (see
    // memoryExtractor.js's comment on why: an unconstrained project_key
    // was the root cause of correct extractions being saved under the
    // wrong/no project). This asserts the field is present and, when the
    // registry has projects, is properly enum-constrained - not that the
    // whole schema matches a fixed snapshot that can drift from what
    // project rows the test DB happens to have.
    fakeCompleteCallLog = [];
    fakeCompleteImpl = async () => '{"memories": [], "conversation_update": {}}';

    await memoryExtractor.extractMemory('Some message with no deterministic match at all here.', {});

    const fallbackFormat = fakeCompleteCallLog[0] && fakeCompleteCallLog[0].options.format;
    const projectKeyField = fallbackFormat &&
        fallbackFormat.properties.memories.items.properties.project_key;

    ok(
        'memoryExtractor\'s fallback classifier call carries a project_key-aware schema-constrained format',
        fakeCompleteCallLog.length === 1 &&
        !!fallbackFormat &&
        JSON.stringify(fallbackFormat.properties.memories.items.properties.category) === JSON.stringify(memoryExtractor.EXTRACTION_SCHEMA.properties.memories.items.properties.category) &&
        !!projectKeyField &&
        projectKeyField.type === 'string' &&
        (!Array.isArray(projectKeyField.enum) || projectKeyField.enum.every(k => typeof k === 'string')),
        JSON.stringify(fallbackFormat)
    );

    // Reset the fake back to the well-behaved baseline used by later
    // sections/tests.
    fakeCompleteCallLog = [];
    fakeCompleteImpl = async (messages) => {
        const prompt = messages[1].content;
        if (prompt.includes('RAW TRIGGER:')) {
            return '{"subject": "explanations", "topics": ["step_by_step", "technical_explanations", "coding"], "trigger": "when helping with coding or technical problems", "context": "technical_explanations"}';
        }
        return '{"subject": "authentication", "topics": ["supabase", "login"]}';
    };
}

/**
 * ============================================================
 * 7. CONTEXT BUILDER — project memory separation
 * ============================================================
 *
 * contextManager.js already scopes `relevantMemory.projects` to the
 * active project and/or any project explicitly named in the message
 * - but contextBuilder.js used to re-group that already-scoped list
 * by `subject` (e.g. "authentication") instead of by `project_key`,
 * and label the "active" group by comparing that subject string
 * against the active project's name, which could never match. Two
 * different projects sharing a subject would silently merge under
 * one unlabeled header. This exercises the real buildContext() with
 * two projects present at once (as if the user asked about a
 * non-active project by name) and checks the resulting prompt text
 * keeps them clearly separated and correctly labeled.
 */

async function testContextBuilderProjectSeparation() {
    section('7. Context Builder — project memory separation');

    const relevantMemory = {
        hotState: { activeProject: null, activeFiles: [], currentTask: null },
        state: [{ key: 'current_project', value: 'atlas', category: 'state' }],
        personal: [],
        projects: [
            { project_key: 'atlas', subject: 'authentication', key: 'auth_provider', value: 'Uses Supabase Auth with JWT sessions.' },
            { project_key: 'bindex', subject: 'authentication', key: 'auth_provider', value: 'Uses Supabase Auth with email/password only.' },
            { project_key: 'bindex', subject: 'database', key: 'storage', value: 'Card images live in Supabase storage, not the DB.' }
        ],
        projectNames: { atlas: 'Atlas', bindex: 'Bindex' },
        activeProjectKey: 'atlas',
        knowledge: [],
        procedures: [],
        features: [],
        manifest: {}
    };

    // Stand in for contextManager.getRelevantContext() so this
    // exercises the real buildContext() formatting logic without
    // needing the full retrieval pipeline behind it.
    const contextManagerPath = require.resolve('../src/core/contextManager');
    const realContextManager = require(contextManagerPath).getRelevantContext;
    require.cache[contextManagerPath].exports.getRelevantContext = async () => relevantMemory;

    let prompt;
    try {
        prompt = await buildContext({
            mode: 'auto',
            intent: { intent: 'conversation' },
            responseStyle: null,
            memoryResult: {},
            toolResult: { needsTool: false },
            userInput: 'What does Bindex use for auth compared to Atlas?',
            history: [],
            policy: 'NONE',
            workingContext: {}
        });
    } finally {
        require.cache[contextManagerPath].exports.getRelevantContext = realContextManager;
    }

    ok(
        'active project (Atlas) gets an ACTIVE PROJECT header',
        prompt.includes('ACTIVE PROJECT: ATLAS'),
        'prompt did not contain an Atlas active-project header'
    );

    ok(
        'non-active project (Bindex) gets a plain PROJECT header, not ACTIVE',
        prompt.includes('PROJECT: BINDEX') && !prompt.includes('ACTIVE PROJECT: BINDEX'),
        'prompt incorrectly marked Bindex as active, or omitted it'
    );

    // The real regression case: both projects have an "authentication"
    // subject. Each fact must still appear once, under its own
    // project's block - not merged into one shared block.
    const atlasBlockStart = prompt.indexOf('ACTIVE PROJECT: ATLAS');
    const bindexBlockStart = prompt.indexOf('PROJECT: BINDEX');
    const atlasBlock = prompt.slice(atlasBlockStart, bindexBlockStart > atlasBlockStart ? bindexBlockStart : undefined);
    const bindexBlock = prompt.slice(bindexBlockStart);

    ok(
        "Atlas's auth fact appears in Atlas's block, not Bindex's",
        atlasBlock.includes('JWT sessions') && !bindexBlock.includes('JWT sessions'),
        'Atlas auth fact leaked into or was missing from the Atlas block'
    );

    ok(
        "Bindex's auth fact appears in Bindex's block, not Atlas's",
        bindexBlock.includes('email/password only') && !atlasBlock.includes('email/password only'),
        'Bindex auth fact leaked into or was missing from the Bindex block'
    );

    ok(
        'both projects retain their own "authentication" subject line despite sharing that subject name',
        (prompt.match(/AUTHENTICATION/g) || []).length >= 2,
        'expected two separate AUTHENTICATION subject headers (one per project)'
    );
}

/**
 * ============================================================
 * 8. LLM QUEUE — background-memory calls no longer race
 * ============================================================
 */

async function testLlmQueue() {
    section('8. LLM Queue — background memory calls are serialized');

    let active = 0;
    let maxActive = 0;
    const order = [];

    function job(id, delayMs) {
        return llmQueue.enqueue(async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            order.push(`start:${id}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            order.push(`end:${id}`);
            active -= 1;
            return id;
        });
    }

    const start = Date.now();

    const results = await Promise.all([
        job('a', 30),
        job('b', 30),
        job('c', 30)
    ]);

    const elapsed = Date.now() - start;

    ok(
        'three concurrent enqueue() calls never overlap execution',
        maxActive === 1,
        `observed max concurrent = ${maxActive}`
    );

    ok(
        'each job still starts only after the previous one fully finishes',
        order.join(',') === 'start:a,end:a,start:b,end:b,start:c,end:c',
        order.join(',')
    );

    ok(
        'total time reflects serialized execution, not parallel execution',
        elapsed >= 85,
        `elapsed=${elapsed}ms (expected roughly >= 90ms for 3x30ms serialized)`
    );

    ok(
        'results still resolve in submission order with correct values',
        results.join(',') === 'a,b,c'
    );

    // A rejected job must not wedge the queue for jobs behind it.
    let recovered = false;
    try {
        await llmQueue.enqueue(async () => {
            throw new Error('simulated failure');
        });
    } catch (e) {
        recovered = e.message === 'simulated failure';
    }

    const afterFailure = await llmQueue.enqueue(async () => 'still working');

    ok(
        'a rejected job surfaces its own error to its caller',
        recovered
    );

    ok(
        'the queue keeps processing jobs queued behind a failed one',
        afterFailure === 'still working'
    );
}

/**
 * ============================================================
 * RUN
 * ============================================================
 */

async function run() {
    console.log('');
    console.log('=== Procedural + Project Memory Pipeline Audit ===');

    try {
        await testEligibility();
        testProceduralPatterns();
        await testProceduralExtractEndToEnd();
        await testProjectExtractEndToEnd();
        await testSemanticEnrichment();
        await testReasoningLeakRobustness();
        await testContextBuilderProjectSeparation();
        await testLlmQueue();
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
