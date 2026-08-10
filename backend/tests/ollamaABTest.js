// backend/tests/ollamaABTest.js
const http = require('http');

async function testOllama(think) {
    const payload = JSON.stringify({
        model: 'qwen3:4b',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        think: think
    });

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
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('--- TEST B: think = true (Full Message Object) ---');
    const resB = await testOllama(true);
    
    console.log(`Eval Count:    ${resB.eval_count} tokens`);
    console.log(`Eval Duration: ${Math.round(resB.eval_duration / 1000000)} ms\n`);
    
    console.log('Full Message Object Structure:');
    console.dir(resB.message, { depth: null });
}

run().catch(console.error);