// backend/tests/thinkFilter.test.js
//
// Verifies the streaming reasoning filter (utils/thinkFilter.js) and the
// post-hoc scrubber (response/processor.js removeThinkingTraces) against the
// exact shapes qwen3:4b actually produces on the content channel when it
// reasons with Ollama's think=false:
//
//   - Reasoning prose with a stray </think> (no opener) followed by the real
//     answer - the reasoning must NEVER reach the UI stream or TTS.
//   - Reasoning prose cut off by maxTokens with no closing tag - nothing may
//     be emitted as if it were an answer.
//   - Proper <think>...</think> blocks (think=true path).
//   - Ordinary replies with no reasoning at all must still stream out intact.
//
// Run: node tests/thinkFilter.test.js

const assert = require('assert');
const { ThinkFilter } = require('../src/utils/thinkFilter');
const {
    looksLikeReasoningProse,
    reasoningProseDensity,
} = require('../src/utils/jsonExtractor');
const { removeThinkingTraces } = require('../src/response/processor');

// Simulates Ollama streaming: feeds the raw model output through the filter
// in fixed-size slices (non-word-aligned, like real token chunks). Slicing
// guarantees the reconstructed stream is byte-identical to the raw output.
function runFilter(rawOutput, { chunkSize = 12 } = {}) {
    const filter = new ThinkFilter({ requestId: 'TEST', onLog: () => {} });
    let emitted = '';

    for (let i = 0; i < rawOutput.length; i += chunkSize) {
        const safe = filter.push(rawOutput.slice(i, i + chunkSize));
        if (safe) emitted += safe;
    }
    const tail = filter.finalize();
    if (tail) emitted += tail;

    return emitted;
}

// ---- Real captured qwen3:4b output (think=false, content channel) ----

const PROSE_CAPITAL = [
    'Okay, the user is asking what the capital of France is. I need to respond directly',
    ' with only the final answer without any extra explanation. ',
    'Hmm, as Atlas, I know that Paris is the capital of France. This is a straightforward fact. ',
    'I should make sure I\'m not adding any fluff or reasoning. The user specifically said ',
    '"Do not narrate reasoning" and "Respond directly with only the final answer." ',
    'So the clean answer is just "Paris". No need for anything else. ',
    'Let me double-check - yes, Paris has been the capital since the Middle Ages and remains the political center. Definitely correct. ',
    'Final response will be exactly: Paris\n</think>\n\nParis'
].join('');

const PROSE_CAPABILITIES = [
    'Okay, the user asked me what I can do. First, I need to recall my role as Atlas. ',
    'I am Qwen3, the latest large language model developed by Tongyi Lab. ',
    'My main function is to assist with various tasks like answering questions, writing stories, emails, scripts, performing logical reasoning, coding, and more. ',
    'The user might be new to me, so I should keep the response simple and friendly.\n',
    'I need to make sure the answer is concise and directly addresses the user\'s question without any extra information. ',
    'Also, the user said "Hi!" so they\'re probably in a friendly mood. I should match that tone.\n',
    'Wait, the instructions say to respond directly with only the final answer. No reasoning. ',
    'So I need to just list what I can do in a brief way.\n',
    'Let me think: The key points are answering questions, writing, coding, logical reasoning, etc. ',
    'Yes, the answer should be: I can help with answering questions, writing stories, emails, scripts, logical reasoning, coding, and more!\n</think>\n',
    '- Understand and generate human-like text\n- Answer questions\n- Write creative content\n- Solve coding problems\n- Perform logical reasoning'
].join('');

// Cut off mid-reasoning by maxTokens - NO </think> ever arrives.
const PROSE_CUTOFF = [
    'Okay, the user asked "What time is it?" Hmm, as Atlas, I need to respond directly with only the final answer without any',
    ' reasoning. But since I don\'t have that info, the answer is that I don\'t know. So the final answer should be ',
    '"I don\'t know the current time." But the user said "only the final answer," so maybe just "I don\'t know." Wait, no. ',
    'Let me think. Alternatively, if the'
].join('');

// Proper tagged block (think=true path where Ollama puts tags in content).
const TAGGED = '<think>Let me recall the capital of France. I remember Paris is the capital.</think>\nThe capital of France is Paris.';

// Ordinary replies with no reasoning at all.
const PLAIN_SHORT = 'Sure!';
const PLAIN_MEDIUM = 'The capital of France is Paris. It has been the capital since the Middle Ages and remains the political and administrative center today.';
const PLAIN_LONG = ('This is a normal multi-sentence answer without any reasoning. '.repeat(30));

// A legitimate answer that OPENS with a reasoning-like phrase but does not
// keep narrating - must survive.
const LEGIT_OPENER = 'Let me start by saying that Paris is the capital of France, and it has been for centuries.';

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok  - ${name}`);
    } catch (e) {
        failures++;
        console.error(`  FAIL - ${name}\n        ${e.message}`);
    }
}

console.log('ThinkFilter streaming behavior');

check('prose reasoning + stray </think>: never emits reasoning, only the answer', () => {
    const out = runFilter(PROSE_CAPITAL);
    assert.strictEqual(out, '\n\nParis', `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('</think>'), 'stray </think> tag leaked');
    assert.ok(!out.includes('the user is asking'), 'reasoning leaked');
    assert.ok(!out.includes('Let me double-check'), 'reasoning leaked');
});

check('prose reasoning + bullet answer: only bullets stream out', () => {
    const out = runFilter(PROSE_CAPABILITIES);
    assert.ok(out.includes('Understand and generate human-like text'), `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('the user asked me'), 'reasoning leaked');
    assert.ok(!out.includes('</think>'), 'tag leaked');
});

check('prose reasoning cut off with no </think>: nothing emitted (no leak)', () => {
    const out = runFilter(PROSE_CUTOFF);
    assert.strictEqual(out, '', `got: ${JSON.stringify(out)}`);
});

check('tagged <think>...</think>: only text after the block emits', () => {
    const out = runFilter(TAGGED);
    assert.ok(out.includes('The capital of France is Paris.'), `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('Let me recall'), 'tagged reasoning leaked');
    assert.ok(!out.includes('</think>'), 'tag leaked');
});

check('plain short reply survives', () => {
    assert.strictEqual(runFilter(PLAIN_SHORT), 'Sure!');
});

check('plain medium reply survives', () => {
    const out = runFilter(PLAIN_MEDIUM);
    assert.strictEqual(out, PLAIN_MEDIUM);
});

check('plain long reply survives intact', () => {
    const out = runFilter(PLAIN_LONG);
    assert.strictEqual(out, PLAIN_LONG);
});

check('legit answer that opens with a reasoning phrase survives', () => {
    const out = runFilter(LEGIT_OPENER);
    assert.strictEqual(out, LEGIT_OPENER);
});

check('reasoning split across many tiny chunks still fully held', () => {
    // Force the reasoning opener to land in separate sub-chunks.
    const out = runFilter(PROSE_CAPITAL, { chunkSize: 6 });
    assert.ok(out.includes('Paris'), `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('the user is asking'), 'reasoning leaked on tiny chunks');
});

console.log('\nlooksLikeReasoningProse / reasoningProseDensity');

check('detects captured reasoning openings', () => {
    assert.ok(looksLikeReasoningProse('Okay, the user is asking what the capital of France is.'));
    assert.ok(looksLikeReasoningProse('Hmm, the user just greeted me with "Hi!"'));
    assert.ok(looksLikeReasoningProse('First, I need to check the heuristics.'));
    assert.ok(looksLikeReasoningProse('Let me think about the best approach.'));
    assert.ok(looksLikeReasoningProse('We are given a user message.'));
    assert.ok(looksLikeReasoningProse('Looking at the memory, I recall...'));
});

check('does not flag ordinary answer openings', () => {
    assert.ok(!looksLikeReasoningProse('The capital of France is Paris.'));
    assert.ok(!looksLikeReasoningProse('Sure! Here is what I found.'));
    assert.ok(!looksLikeReasoningProse('I can help you with that.'));
    assert.ok(!looksLikeReasoningProse('Here is how you fix it.'));
});

check('single "let me" opener is not enough on its own to be held as reasoning', () => {
    // The opening pattern alone matches "Let me start by saying..."; the
    // filter's density gate (>= 2 narration markers) is what keeps such a
    // legit reply from being mistaken for a reasoning trace.
    assert.ok(looksLikeReasoningProse('Let me start by saying that Paris is the capital.'));
    assert.strictEqual(reasoningProseDensity('Let me start by saying that Paris is the capital.'), 1);
    assert.strictEqual(runFilter('Let me start by saying that Paris is the capital of France, and it has been for centuries.'),
        'Let me start by saying that Paris is the capital of France, and it has been for centuries.');
});

check('reasoning prose has high density, ordinary text has low', () => {
    assert.ok(reasoningProseDensity(PROSE_CAPITAL) >= 3, `capital density = ${reasoningProseDensity(PROSE_CAPITAL)}`);
    assert.ok(reasoningProseDensity(PROSE_CUTOFF) >= 3, `cutoff density = ${reasoningProseDensity(PROSE_CUTOFF)}`);
    assert.strictEqual(reasoningProseDensity(PLAIN_MEDIUM), 0);
    assert.ok(reasoningProseDensity(LEGIT_OPENER) < 2, `legit opener density = ${reasoningProseDensity(LEGIT_OPENER)}`);
});

console.log('\nremoveThinkingTraces post-hoc scrubbing');

check('strips tagged reasoning to the answer', () => {
    const out = removeThinkingTraces(TAGGED);
    assert.ok(out.includes('The capital of France is Paris.'), `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('Let me recall'), 'tagged reasoning leaked');
});

check('strips prose reasoning when a stray </think> exists', () => {
    const out = removeThinkingTraces(PROSE_CAPITAL);
    assert.ok(out.includes('Paris'), `got: ${JSON.stringify(out)}`);
    assert.ok(!out.includes('the user is asking'), 'prose reasoning leaked');
    assert.ok(!out.includes('</think>'), 'stray tag leaked');
});

check('drops unclosed prose reasoning entirely (no </think>)', () => {
    const out = removeThinkingTraces(PROSE_CUTOFF);
    assert.strictEqual(out, '', `got: ${JSON.stringify(out)}`);
});

check('keeps a long legit answer with no reasoning intact', () => {
    const out = removeThinkingTraces(PLAIN_LONG);
    assert.strictEqual(out, PLAIN_LONG.trim());
});

check('keeps a short legit answer that opens like reasoning', () => {
    const out = removeThinkingTraces(LEGIT_OPENER);
    assert.ok(out.includes('Paris'), `got: ${JSON.stringify(out)}`);
});

if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED`);
    process.exit(1);
}
console.log('\nAll thinkFilter tests passed.');
