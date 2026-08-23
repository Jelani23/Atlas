// backend/tests/thinkLeakLiveCheck.js
// Live integration check: streams qwen3:4b through the real ollama provider
// and the ThinkFilter exactly as conversationEngine does, then reports what
// the UI/TTS would have received. Run: node tests/thinkLeakLiveCheck.js
const { streamComplete } = require('../src/models/providers/ollama');
const { ThinkFilter } = require('../src/utils/thinkFilter');

async function run(question, think) {
    const messages = [
        { role: 'system', content: 'You are Atlas. Respond directly with only the final answer. Do not narrate reasoning.' },
        { role: 'user', content: question }
    ];
    const filter = new ThinkFilter({ requestId: 'LIVE', onLog: () => {} });
    let emitted = '';
    let rawContent = '';
    let thinkingChars = 0;

    const stream = streamComplete(messages, { model: 'qwen3:4b', think, maxTokens: 400 });
    for await (const chunk of stream) {
        if (chunk.type === 'thinking') {
            thinkingChars += chunk.text.length; // never touches UI/TTS
        } else if (chunk.type === 'content') {
            rawContent += chunk.text;
            const safe = filter.push(chunk.text);
            if (safe) emitted += safe;
        }
    }
    const tail = filter.finalize();
    if (tail) emitted += tail;

    console.log(`--- think=${think} "${question}"`);
    console.log(`  thinking channel chars: ${thinkingChars}`);
    console.log(`  raw content chars:      ${rawContent.length}`);
    console.log(`  has </think>?           ${rawContent.includes('</think>')}`);
    console.log(`  UI/TTS emitted chars:   ${emitted.length}`);
    console.log(`  leaked reasoning?       ${/the user|Let me|I need to|<\/think>|<\/?think>/i.test(emitted)}`);
    console.log(`  emitted text: ${JSON.stringify(emitted.slice(0, 300))}`);
    console.log(`  raw content tail: ${JSON.stringify(rawContent.slice(-160))}`);
    console.log();
}

(async () => {
    await run('What is the capital of France?', false);
    await run('What is the capital of France?', true);
    await run('Hi! What can you do?', false);
})().catch((e) => { console.error(e); process.exit(1); });
