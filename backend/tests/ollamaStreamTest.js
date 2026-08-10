// backend/tests/ollamaStreamTest.js
const http = require('http');

async function testStream(think, useNoThinkPrompt) {
    const messages = [];
    if (useNoThinkPrompt) {
        messages.push({ role: 'system', content: '/no_think' });
    }
    messages.push({ role: 'user', content: 'Hello' });

    const payload = JSON.stringify({
        model: 'qwen3:4b',
        messages,
        stream: true,
        think: think
    });

    const startTime = Date.now();
    let firstChunkTime = null;
    let firstThinkingTime = null;
    let firstContentTime = null;
    
    let thinkingText = '';
    let contentText = '';
    let metrics = null;

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 11434,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let buffer = '';
            res.on('data', (chunk) => {
                if (firstChunkTime === null) firstChunkTime = Date.now() - startTime;
                
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.message) {
                            if (data.message.thinking) {
                                if (firstThinkingTime === null) firstThinkingTime = Date.now() - startTime;
                                thinkingText += data.message.thinking;
                            }
                            if (data.message.content) {
                                if (firstContentTime === null) firstContentTime = Date.now() - startTime;
                                contentText += data.message.content;
                            }
                        }
                        if (data.done) {
                            metrics = data;
                        }
                    } catch (e) {}
                }
            });
            res.on('end', () => {
                const endTime = Date.now() - startTime;
                resolve({
                    firstChunkMs: firstChunkTime,
                    firstThinkingMs: firstThinkingTime,
                    firstContentMs: firstContentTime,
                    totalMs: endTime,
                    thinkingTokens: Math.ceil(thinkingText.length / 4),
                    contentTokens: Math.ceil(contentText.length / 4),
                    thinkingPreview: thinkingText.substring(0, 50),
                    contentPreview: contentText.substring(0, 50),
                    ollamaEvalCount: metrics ? metrics.eval_count : 'N/A',
                    ollamaEvalDurationMs: metrics ? Math.round(metrics.eval_duration / 1000000) : 'N/A'
                });
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('Running Streaming Experiments...\n');

    console.log('--- TEST A: think = false ---');
    const resA = await testStream(false, false);
    console.log(`1st Chunk:      ${resA.firstChunkMs} ms`);
    console.log(`1st Thinking:   ${resA.firstThinkingMs !== null ? resA.firstThinkingMs + ' ms' : 'None'}`);
    console.log(`1st Content:    ${resA.firstContentMs !== null ? resA.firstContentMs + ' ms' : 'None'}`);
    console.log(`Thinking Tokens:${resA.thinkingTokens}`);
    console.log(`Content Tokens: ${resA.contentTokens}`);
    console.log(`Ollama Tokens:  ${resA.ollamaEvalCount}`);
    console.log(`Ollama Eval Ms: ${resA.ollamaEvalDurationMs}`);
    console.log(`Total Ms:       ${resA.totalMs}`);
    console.log(`Content Preview:${resA.contentPreview}\n`);

    console.log('--- TEST B: think = true ---');
    const resB = await testStream(true, false);
    console.log(`1st Chunk:      ${resB.firstChunkMs} ms`);
    console.log(`1st Thinking:   ${resB.firstThinkingMs !== null ? resB.firstThinkingMs + ' ms' : 'None'}`);
    console.log(`1st Content:    ${resB.firstContentMs !== null ? resB.firstContentMs + ' ms' : 'None'}`);
    console.log(`Thinking Tokens:${resB.thinkingTokens}`);
    console.log(`Content Tokens: ${resB.contentTokens}`);
    console.log(`Ollama Tokens:  ${resB.ollamaEvalCount}`);
    console.log(`Ollama Eval Ms: ${resB.ollamaEvalDurationMs}`);
    console.log(`Total Ms:       ${resB.totalMs}`);
    console.log(`Thinking Preview:${resB.thinkingPreview}`);
    console.log(`Content Preview: ${resB.contentPreview}\n`);

    console.log('--- TEST C: think = true + /no_think prompt ---');
    const resC = await testStream(true, true);
    console.log(`1st Chunk:      ${resC.firstChunkMs} ms`);
    console.log(`1st Thinking:   ${resC.firstThinkingMs !== null ? resC.firstThinkingMs + ' ms' : 'None'}`);
    console.log(`1st Content:    ${resC.firstContentMs !== null ? resC.firstContentMs + ' ms' : 'None'}`);
    console.log(`Thinking Tokens:${resC.thinkingTokens}`);
    console.log(`Content Tokens: ${resC.contentTokens}`);
    console.log(`Ollama Tokens:  ${resC.ollamaEvalCount}`);
    console.log(`Ollama Eval Ms: ${resC.ollamaEvalDurationMs}`);
    console.log(`Total Ms:       ${resC.totalMs}`);
    console.log(`Content Preview:${resC.contentPreview}\n`);
}

run().catch(console.error);