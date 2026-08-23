require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

// supabaseClient validates presence of these at require time. The layer's
// retrieval is injected in these tests, so dummy values (never used) are
// enough to let the module graph load without a real database.
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-key';

//
// Preprocessing Layer Test
//
// Verifies the optional Groq/Gemini pre-contextualization layer:
//   - master switch off => pure no-op, never calls a provider
//   - enabled but missing keys => skipped, never calls a provider
//   - Groq stage: valid JSON is parsed; malformed/throwing responses
//     fall back to null without crashing the pipeline
//   - Gemini stage: runs over injected (fake) retrieved context and can
//     filter it; a failing Gemini call preserves the unprocessed context
//   - shortCircuit requests skip the layer entirely
//   - determineProcessingNeeds implements the spec's decision tree
//     (simple -> none, ambiguous -> Groq, context-heavy -> Gemini,
//      complex -> both)
//   - Groq's profile is authoritative and gates the Gemini stage
//   - context-heavy deterministic tools (e.g. webSearch) run Gemini
//     without spending a Groq request
//
// Providers are injected via the layer's `overrides` seam, so no network
// call and no database are needed.

const PREPROCESSING_MODULES = [
    '../src/preprocessing/preprocessingConfig',
    '../src/preprocessing/semanticAnalyzer',
    '../src/preprocessing/contextualProcessor',
    '../src/preprocessing/preprocessingLayer'
];

function clearPreprocessingCache() {
    for (const mod of PREPROCESSING_MODULES) {
        const abs = require.resolve(mod);
        delete require.cache[abs];
    }
}

// Load a fresh layer under the given env overrides. env vars are read
// once at require time, so each scenario re-requires the modules.
function loadLayer(envOverrides) {
    for (const [key, value] of Object.entries(envOverrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    clearPreprocessingCache();
    return require('../src/preprocessing/preprocessingLayer');
}

function spyAdapter({ result, throws } = {}) {
    return {
        calls: [],
        async complete(messages, options) {
            this.calls.push({ messages, options });
            if (throws) throw throws;
            if (typeof result === 'function') return result(messages, options);
            return result;
        }
    };
}

function assert(cond, msg) {
    if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

const SEMANTIC_JSON = JSON.stringify({
    taskType: 'coding',
    communicationType: 'command',
    ambiguous: false,
    contextRequired: true,
    memoryRelevant: true,
    needsTools: true
});

const CONTEXTUAL_JSON = JSON.stringify({
    summary: 'User is asking about the auth module.',
    keep: [],
    drop: [0],
    notes: 'Focus on authentication details.'
});

function fakeRelevantMemory() {
    return {
        state: [],
        personal: [],
        projects: [],
        knowledge: [
            { key: 'auth_setup', value: 'uses OAuth2', subject: 'authentication', category: 'fact' },
            { key: 'colors', value: 'team prefers blue', subject: 'design', category: 'fact' },
            { key: 'deploy', value: 'uses docker', subject: 'devops', category: 'fact' }
        ],
        procedures: [],
        features: [],
        hotState: { activeProject: 'atlas', activeFiles: [], currentTask: null },
        manifest: { totalUsed: 100 }
    };
}

async function runTest() {
    console.log('\n========================================');
    console.log('Preprocessing Layer Test');
    console.log('========================================\n');

    try {
        // --- 1. Master switch disabled => pure no-op -------------------
        {
            const throwingGroq = spyAdapter({ throws: new Error('should not be called') });
            const throwingGemini = spyAdapter({ throws: new Error('should not be called') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: undefined,
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key'
            });
            const result = await layer.runPreprocessing({
                userInput: 'help me write code',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: throwingGroq, geminiAdapter: throwingGemini }
            });
            assert(result.ran === false, 'switch-off should not mark the layer as ran');
            assert(result.semantic === null, 'switch-off should not produce a semantic profile');
            assert(result.contextual === null, 'switch-off should not produce contextual output');
            assert(result.relevantMemory === null, 'switch-off should not retrieve context');
            assert(throwingGroq.calls.length === 0, 'switch-off should never call Groq');
            assert(throwingGemini.calls.length === 0, 'switch-off should never call Gemini');
            console.log('✓ 1. Master switch disabled => pure no-op');
        }

        // --- 2. Enabled but missing API keys => skipped, no calls ------
        {
            const throwingGroq = spyAdapter({ throws: new Error('should not be called') });
            const throwingGemini = spyAdapter({ throws: new Error('should not be called') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: undefined,
                GEMINI_API_KEY: undefined
            });
            const result = await layer.runPreprocessing({
                userInput: 'help me write code',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: throwingGroq, geminiAdapter: throwingGemini }
            });
            assert(result.ran === false, 'missing keys should skip the layer');
            assert(throwingGroq.calls.length === 0, 'missing key should never call Groq');
            assert(throwingGemini.calls.length === 0, 'missing key should never call Gemini');
            console.log('✓ 2. Enabled but missing API keys => skipped, no calls');
        }

        // --- 3. Groq stage succeeds -----------------------------------
        {
            const groq = spyAdapter({ result: SEMANTIC_JSON });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: undefined,
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key',
                GROQ_MODEL: 'llama-3.1-8b-instant',
                GEMINI_MODEL: 'gemini-2.5-flash'
            });
            const result = await layer.runPreprocessing({
                userInput: 'refactor this function',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: groq }
            });
            assert(result.ran === true, 'successful Groq stage should mark ran=true');
            assert(result.semantic && result.semantic.taskType === 'coding', 'semantic profile should be parsed');
            assert(result.semantic.needsTools === true, 'semantic profile fields should be parsed');
            assert(groq.calls.length === 1, 'Groq should be called exactly once');
            assert(groq.calls[0].options.model === 'llama-3.1-8b-instant', 'Groq model should be configurable via env');

            const layerCustom = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GROQ_MODEL: 'llama-3.1-70b-versatile'
            });
            const customGroq = spyAdapter({ result: SEMANTIC_JSON });
            await layerCustom.runPreprocessing({
                userInput: 'refactor this function',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: customGroq }
            });
            assert(customGroq.calls[0].options.model === 'llama-3.1-70b-versatile', 'GROQ_MODEL override should take effect');
            console.log('✓ 3. Groq stage succeeds and parses structured output');
        }

        // --- 4. Groq malformed response => graceful fallback ----------
        {
            const groq = spyAdapter({ result: 'I have no idea what JSON is.' });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key'
            });
            const result = await layer.runPreprocessing({
                userInput: 'hello',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: groq }
            });
            assert(result.ran === false, 'malformed response should not mark ran');
            assert(result.semantic === null, 'malformed response should yield null profile');
            console.log('✓ 4. Groq malformed response => graceful fallback');
        }

        // --- 5. Groq throws (rate limit) => graceful fallback ----------
        {
            const groq = spyAdapter({ throws: new Error('429 Rate limit exceeded') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key'
            });
            const result = await layer.runPreprocessing({
                userInput: 'hello',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: groq }
            });
            assert(result.ran === false, 'throwing Groq should not mark ran');
            assert(result.semantic === null, 'throwing Groq should yield null profile');
            console.log('✓ 5. Groq throws (rate limit) => graceful fallback');
        }

        // --- 6. Gemini stage succeeds and filters retrieved context ----
        {
            const gemini = spyAdapter({ result: CONTEXTUAL_JSON });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: undefined,
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key'
            });
            const retrieval = countRetrieval(fakeRelevantMemory());
            const result = await layer.runPreprocessing({
                userInput: 'tell me about auth',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { geminiAdapter: gemini, getRelevantContext: retrieval.fn }
            });
            assert(result.ran === true, 'successful Gemini stage should mark ran=true');
            assert(result.contextual && result.contextual.drop.includes(0), 'contextual decision should be captured');
            assert(retrieval.calls === 1, 'retrieval should happen exactly once');
            assert(result.relevantMemory, 'relevantMemory should be present');
            assert(result.relevantMemory.knowledge.length === 2, 'dropped index [0] should be filtered out');
            assert(result.contextualNotes && result.contextualNotes.includes('auth'), 'contextual notes should be built');
            console.log('✓ 6. Gemini stage succeeds, filters retrieved context, produces notes');
        }

        // --- 7. Gemini throws => unprocessed retrieval preserved -------
        {
            const gemini = spyAdapter({ throws: new Error('timeout') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GEMINI_API_KEY: 'test-key'
            });
            const memory = fakeRelevantMemory();
            const result = await layer.runPreprocessing({
                userInput: 'tell me about auth',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { geminiAdapter: gemini, getRelevantContext: async () => memory }
            });
            assert(result.contextual === null, 'throwing Gemini should yield null contextual output');
            assert(result.relevantMemory === memory, 'retrieved context should be preserved unprocessed');
            console.log('✓ 7. Gemini throws => unprocessed retrieval preserved');
        }

        // --- 8. shortCircuit requests skip the layer -------------------
        {
            const throwingGroq = spyAdapter({ throws: new Error('should not be called') });
            const throwingGemini = spyAdapter({ throws: new Error('should not be called') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key'
            });
            const result = await layer.runPreprocessing({
                userInput: 'what is 2+2',
                intent: { state: 'DETERMINISTIC', winner: 'calculate' },
                history: [],
                toolResult: { needsTool: true, toolName: 'calculate', shortCircuit: true },
                overrides: { groqAdapter: throwingGroq, geminiAdapter: throwingGemini }
            });
            assert(result.ran === false, 'shortCircuit should skip the layer');
            assert(throwingGroq.calls.length === 0, 'shortCircuit should never call Groq');
            assert(throwingGemini.calls.length === 0, 'shortCircuit should never call Gemini');
            console.log('✓ 8. Deterministic shortCircuit requests skip the layer');
        }

        // --- 9. contextualProcessor helpers (unit) ---------------------
        {
            const { isWorthProcessing, applyFiltering } = require('../src/preprocessing/contextualProcessor');
            assert(isWorthProcessing(fakeRelevantMemory()) === true, 'non-empty context should be worth processing');
            assert(isWorthProcessing(null) === false, 'null context should not be worth processing');
            assert(isWorthProcessing({ knowledge: [] }) === false, 'empty context should not be worth processing');

            const memory = fakeRelevantMemory();
            const filtered = applyFiltering(memory, { keep: [], drop: [0, 1] });
            assert(filtered.knowledge.length === 1, 'drop should remove the two marked indices');

            const guarded = applyFiltering(memory, { keep: [], drop: [0, 1, 2, 3, 4, 5] });
            assert(guarded.knowledge.length === 3, 'section should never be fully emptied');

            const unchanged = applyFiltering(memory, { keep: [], drop: [] });
            assert(unchanged.knowledge.length === 3, 'empty decision should leave context unchanged');

            const unchanged2 = applyFiltering(memory, null);
            assert(unchanged2 === memory, 'null decision should return context as-is');
            console.log('✓ 9. contextualProcessor filtering helpers behave conservatively');
        }

        // --- 10. shouldSkip gate --------------------------------------
        {
            const layer = loadLayer({});
            assert(layer.shouldSkip({ toolResult: { shortCircuit: true } }) === true, 'shortCircuit should skip');
            assert(layer.shouldSkip({ toolResult: { needsTool: false } }) === false, 'LLM path should not skip');
            assert(layer.shouldSkip({}) === false, 'no tool result should not skip');
            console.log('✓ 10. shouldSkip gate behaves correctly');
        }

        // --- 11. determineProcessingNeeds decision tree (unit) ---------
        {
            const layer = loadLayer({});
            const needs = layer.determineProcessingNeeds;

            let d = needs({ intent: { state: 'DETERMINISTIC', winner: 'calculate' }, toolResult: { needsTool: true, shortCircuit: true } });
            assert(d.runSemantic === false && d.runContextual === false, 'shortCircuit skips both stages');

            d = needs({ intent: { state: 'DETERMINISTIC', winner: 'calculate' }, toolResult: { needsTool: true, shortCircuit: false } });
            assert(d.runSemantic === false && d.runContextual === false, 'clearly identified simple tool skips both stages');

            d = needs({ intent: { state: 'DETERMINISTIC', winner: 'webSearch' }, toolResult: { needsTool: true, toolName: 'webSearch' } });
            assert(d.runSemantic === false && d.runContextual === true, 'context-heavy deterministic tool runs Gemini only');

            d = needs({ intent: { state: 'AMBIGUOUS', winner: 'calculate' }, toolResult: { needsTool: false } });
            assert(d.runSemantic === true && d.runContextual === false, 'ambiguous request runs Groq only');

            d = needs({ intent: { state: 'UNKNOWN' }, toolResult: { needsTool: false } });
            assert(d.runSemantic === true && d.runContextual === true, 'unknown request runs both stages');

            d = needs({ intent: { state: 'DETERMINISTIC', llmRequired: true, winner: 'calculate' }, toolResult: { needsTool: false } });
            assert(d.runSemantic === true && d.runContextual === true, 'llmRequired runs both stages');

            d = needs({});
            assert(d.runSemantic === true && d.runContextual === true, 'no intent defaults to running both stages');

            console.log('✓ 11. determineProcessingNeeds decision tree behaves correctly');
        }

        // --- 12. Groq profile gates the Gemini stage -------------------
        {
            // 12a: Groq says context not required => Gemini must NOT run
            const groq = spyAdapter({ result: JSON.stringify({
                taskType: 'conversation', communicationType: 'statement',
                ambiguous: false, contextRequired: false, memoryRelevant: false, needsTools: false
            }) });
            const throwingGemini = spyAdapter({ throws: new Error('should not be called') });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key'
            });
            const resultA = await layer.runPreprocessing({
                userInput: 'hello there',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: groq, geminiAdapter: throwingGemini, getRelevantContext: async () => fakeRelevantMemory() }
            });
            assert(resultA.semantic && resultA.semantic.contextRequired === false, 'semantic profile should be parsed');
            assert(throwingGemini.calls.length === 0, 'Gemini should be skipped when Groq says context not required');
            assert(resultA.contextual === null, 'no contextual output expected');

            // 12b: Groq says context required => Gemini runs over retrieval
            const groq2 = spyAdapter({ result: JSON.stringify({
                taskType: 'conversation', communicationType: 'question',
                ambiguous: false, contextRequired: true, memoryRelevant: true, needsTools: false
            }) });
            const gemini2 = spyAdapter({ result: CONTEXTUAL_JSON });
            const retrieval2 = countRetrieval(fakeRelevantMemory());
            const layer2 = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GROQ_SEMANTIC_PREPROCESSING: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GROQ_API_KEY: 'test-key',
                GEMINI_API_KEY: 'test-key'
            });
            const resultB = await layer2.runPreprocessing({
                userInput: 'remind me of the project context',
                intent: {},
                history: [],
                toolResult: { needsTool: false },
                overrides: { groqAdapter: groq2, geminiAdapter: gemini2, getRelevantContext: retrieval2.fn }
            });
            assert(groq2.calls.length === 1, 'Groq should be called once');
            assert(gemini2.calls.length === 1, 'Gemini should run when Groq flags contextRequired');
            assert(retrieval2.calls === 1, 'retrieval should happen exactly once');
            assert(resultB.contextual !== null, 'contextual output should be produced');
            assert(resultB.relevantMemory, 'filtered relevantMemory should be present');
            console.log('✓ 12. Groq profile gates the Gemini stage');
        }

        // --- 13. Context-heavy deterministic tools run Gemini only -----
        {
            const gemini = spyAdapter({ result: CONTEXTUAL_JSON });
            const layer = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GEMINI_API_KEY: 'test-key'
            });
            const retrieval = countRetrieval(fakeRelevantMemory());
            const result = await layer.runPreprocessing({
                userInput: 'search the web for atlas docs',
                intent: { state: 'DETERMINISTIC', winner: 'webSearch' },
                history: [],
                toolResult: { needsTool: true, toolName: 'webSearch', shortCircuit: false },
                overrides: { geminiAdapter: gemini, getRelevantContext: retrieval.fn }
            });
            assert(gemini.calls.length === 1, 'Gemini should run for context-heavy deterministic tools');
            assert(result.contextual !== null, 'contextual output should be produced');

            // Same path via planner's toolName 'search_web'.
            const gemini3 = spyAdapter({ result: CONTEXTUAL_JSON });
            const layer3 = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GEMINI_API_KEY: 'test-key'
            });
            const retrieval3 = countRetrieval(fakeRelevantMemory());
            const result3 = await layer3.runPreprocessing({
                userInput: 'search the web for atlas docs',
                intent: { state: 'DETERMINISTIC', winner: 'webSearch' },
                history: [],
                toolResult: { needsTool: true, toolName: 'search_web', shortCircuit: false },
                overrides: { geminiAdapter: gemini3, getRelevantContext: retrieval3.fn }
            });
            assert(gemini3.calls.length === 1, 'Gemini should run for planner toolName search_web');
            assert(result3.contextual !== null, 'contextual output should be produced');

            // Same deterministic confidence but a simple tool => no Gemini.
            const throwingGemini = spyAdapter({ throws: new Error('should not be called') });
            const layer2 = loadLayer({
                ATLAS_PREPROCESSING_ENABLED: 'true',
                GEMINI_CONTEXT_PREPROCESSING: 'true',
                GEMINI_API_KEY: 'test-key'
            });
            const result2 = await layer2.runPreprocessing({
                userInput: 'calculate 20 percent of 150',
                intent: { state: 'DETERMINISTIC', winner: 'calculate' },
                history: [],
                toolResult: { needsTool: true, toolName: 'calculate', shortCircuit: false },
                overrides: { geminiAdapter: throwingGemini }
            });
            assert(throwingGemini.calls.length === 0, 'simple deterministic tool should skip preprocessing');
            assert(result2.ran === false, 'simple deterministic tool should not mark the layer as ran');
            console.log('✓ 13. Context-heavy deterministic tools run Gemini only');
        }

        console.log('\n========================================');
        console.log('ALL TESTS PASSED ✓');
        console.log('========================================\n');
    } catch (error) {
        console.error('\n========================================');
        console.error('TEST FAILED ✗');
        console.error('========================================\n');
        console.error(error.message);
        process.exitCode = 1;
    }
}

function countRetrieval(memory) {
    const wrapper = {
        calls: 0,
        async fn(userInput, history, intent) {
            wrapper.calls += 1;
            return memory;
        }
    };
    return wrapper;
}

runTest();
