// tests/runIntentBenchmark.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { resolve } = require('../src/intent/intentResolver');

const testDir = path.join(__dirname, 'intent');
const files = ['basic.json', 'variants.json', 'ambiguous.json', 'edgeCases.json'];

async function runBenchmark() {
    console.log('🧪 STARTING INTENT ROUTING BENCHMARK (PHASE 6.5B ARCHITECTURE)\n');
    
    const results = [];
    let totalTests = 0;
    let ambiguitiesCaught = 0;

    for (const file of files) {
        const filePath = path.join(testDir, file);
        const testCases = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        console.log(`\n--- Running ${file} (${testCases.length} tests) ---`);
        
        for (const test of testCases) {
            totalTests++;
            const start = process.hrtime.bigint();
            
            // Run the new resolver
            const resolution = resolve(test.input);
            
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1e6;
            
            // Map the new resolution to the expected test format
            let selectedTool = resolution.winner || 'LLM_Conversation';
            let success = false;

            if (test.expectedTool === 'CLARIFY') {
                // We expect ambiguity
                success = resolution.state === 'AMBIGUOUS' || resolution.state === 'UNKNOWN';
                if (success) ambiguitiesCaught++;
                selectedTool = resolution.state;
            } else if (test.expectedTool === 'LLM') {
                success = resolution.llmRequired;
                selectedTool = resolution.state;
            } else {
                success = resolution.winner === test.expectedTool;
            }

            results.push({ input: test.input, expected: test.expectedTool, got: selectedTool, success });
            
            console.log(`[${success ? '✅' : '❌'}] "${test.input}" -> Expected: ${test.expectedTool} | Got: ${selectedTool} | Conf: ${resolution.confidence.toFixed(2)} | ${durationMs.toFixed(2)}ms`);
        }
    }

    console.log('\n=========================================');
    console.log('📊 ARCHITECTURE BENCHMARK COMPLETE');
    console.log('=========================================');
    const successes = results.filter(r => r.success).length;
    console.log(`Total Requests: ${totalTests}`);
    console.log(`Ambiguities Caught: ${ambiguitiesCaught}/${files.includes('ambiguous.json') ? 8 : 0}`);
    console.log(`Accuracy: ${successes}/${totalTests} (${((successes/totalTests)*100).toFixed(1)}%)`);
    console.log('=========================================\n');
    
    process.exit(0);
}

runBenchmark().catch(console.error);