require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

//
// Providers + Model Router Test
//
// Verifies:
//   - groq.complete / gemini.complete pass `timeout` as an SDK request
//     option (second arg) instead of inside the request body - the old
//     behavior made both providers fail every call with a 400
//     ("property 'timeout' is unsupported")
//   - gemini.streamComplete yields {type:'content'} chunks (no thinking)
//   - modelRouter routes web search to Gemini 2.5 Flash and everything else
//     stays on the existing ollama/Qwen models
//
// The openai SDK is replaced in require.cache with a fake that records the
// create() arguments, so no network call is made.

let openaiPath;
let realOpenaiModule;
let capturedCalls;

function installFakeOpenAI() {
    openaiPath = require.resolve('openai');
    realOpenaiModule = require.cache[openaiPath];

    const fakeExports = function FakeOpenAI(opts) {
        this.opts = opts;
        this.chat = {
            completions: {
                create: async (...args) => {
                    capturedCalls.push(args);
                    const body = args[0];
                    if (body && body.stream) {
                        return (async function* () {
                            yield { choices: [{ delta: { content: 'hel' } }] };
                            yield { choices: [{ delta: { content: 'lo' } }] };
                        })();
                    }
                    return { choices: [{ message: { content: 'ok' } }] };
                }
            }
        };
    };

    require.cache[openaiPath] = {
        id: openaiPath,
        filename: openaiPath,
        loaded: true,
        exports: fakeExports
    };

    // Re-load the providers so they pick up the fake openai module.
    for (const mod of ['../src/models/providers/groq', '../src/models/providers/gemini']) {
        const abs = require.resolve(mod);
        delete require.cache[abs];
    }
}

function restoreOpenAI() {
    if (openaiPath) {
        require.cache[openaiPath] = realOpenaiModule;
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

async function runTest() {
    console.log('\n========================================');
    console.log('Providers + Model Router Test');
    console.log('========================================\n');

    try {
        installFakeOpenAI();
        capturedCalls = [];

        // --- 1. groq.complete: timeout goes in request options, not body --
        {
            const groq = require('../src/models/providers/groq');
            const reply = await groq.complete(
                [{ role: 'user', content: 'hi' }],
                { model: 'test-model', temperature: 0.1, maxTokens: 5, timeout: 8000 }
            );
            assert(reply === 'ok', 'groq.complete should return the message content');
            assert(capturedCalls.length === 1, 'groq should make exactly one create() call');
            const [body, requestOptions] = capturedCalls[0];
            assert(body.model === 'test-model', 'body should carry the model');
            assert(body.messages[0].content === 'hi', 'body should carry the messages');
            assert(body.max_tokens === 5, 'body should carry max_tokens');
            assert(!('timeout' in body), 'body must NOT contain the timeout property');
            assert(requestOptions.timeout === 8000, 'timeout should be passed as SDK request option');
            console.log('✓ 1. groq.complete: timeout is an SDK request option, not body');
        }

        // --- 2. gemini.complete: same timeout handling -------------------
        {
            capturedCalls = [];
            const gemini = require('../src/models/providers/gemini');
            await gemini.complete(
                [{ role: 'user', content: 'hi' }],
                { model: 'gemini-2.5-flash', timeout: 15000 }
            );
            const [body, requestOptions] = capturedCalls[0];
            assert(!('timeout' in body), 'body must NOT contain the timeout property');
            assert(requestOptions.timeout === 15000, 'timeout should be passed as SDK request option');
            assert(body.stream !== true, 'complete must not stream');
            console.log('✓ 2. gemini.complete: timeout is an SDK request option, not body');
        }

        // --- 3. gemini.streamComplete yields content-only chunks ---------
        {
            capturedCalls = [];
            const gemini = require('../src/models/providers/gemini');
            const chunks = [];
            for await (const chunk of gemini.streamComplete(
                [{ role: 'user', content: 'hi' }],
                { model: 'gemini-2.5-flash', timeout: 15000 }
            )) {
                chunks.push(chunk);
            }
            assert(capturedCalls[0][0].stream === true, 'streamComplete should request a stream');
            assert(capturedCalls[0][1].timeout === 15000, 'timeout should be passed as SDK request option');
            assert(chunks.length === 2, 'stream should yield the two fake deltas');
            assert(chunks.every(c => c.type === 'content'), 'every chunk should be a content chunk');
            assert(chunks[0].text === 'hel' && chunks[1].text === 'lo', 'chunk text should stream through');
            console.log('✓ 3. gemini.streamComplete yields content-only chunks');
        }

        // --- 4. modelRouter routes search to Gemini, rest stays on Qwen ---
        {
            const router = require('../src/models/modelRouter');
            const search = router.getModelForTask('search_web');
            assert(search.provider === 'gemini', 'search_web should route to gemini provider');
            assert(search.supportsThinking === false, 'Gemini search synthesis should not think');
            assert(search.model === (process.env.GEMINI_MODEL || 'gemini-2.5-flash'), 'search should use the configured Gemini model');

            assert(router.getModelForTask('analyze_and_suggest').provider === 'ollama', 'coding tasks stay on ollama');
            assert(router.getModelForTask('calculate').provider === 'ollama', 'other tools stay on ollama');
            assert(router.getModelForTask(undefined).provider === 'ollama', 'plain conversation stays on ollama');
            console.log('✓ 4. modelRouter routes search to Gemini, rest stays on Qwen');
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
    } finally {
        restoreOpenAI();
    }
}

runTest();
