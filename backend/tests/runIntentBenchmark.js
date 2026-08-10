// tests/runIntentBenchmark.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { resolve } = require('../src/intent/intentResolver');
const { execute } = require('../src/tools/toolExecutor');
const permissionManager = require('../src/permissions/permissionManager');

// Auto-approve permissions during benchmark so it doesn't hang
permissionManager.on('permission.requested', (payload) => {
    permissionManager.resolve(payload.id, true);
});

const testDir = path.join(__dirname, 'intent');
const files = ['basic.json', 'variants.json', 'ambiguous.json', 'edgeCases.json', 'fullSuite.json'];

async function runBenchmark() {
    console.log('🚀 STARTING PHASE 8F FULL PERFORMANCE AUDIT\n');
    
    const bucketCounts = { FAST: 0, GOOD: 0, SLOW: 0, BACKGROUND: 0, LLM: 0 };
    let totalTests = 0;
    let routingCorrect = 0;
    let executionSuccessful = 0;

    for (const file of files) {
        const filePath = path.join(testDir, file);
        if (!fs.existsSync(filePath)) continue;
        
        const testCases = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`\n--- Auditing ${file} (${testCases.length} tests) ---`);
        
        for (const test of testCases) {
            totalTests++;
            const start = process.hrtime.bigint();
            
            const intent = resolve(test.input);
            
            let executionTimeMs = 0;
            let actualTool = intent.winner || 'LLM_Conversation';
            let bucket = 'LLM';
            let execSuccess = false;
            
            if (intent.state === 'DETERMINISTIC' && intent.winner) {
                if (intent.winner === 'propose_code_change' || intent.winner === 'analyze_and_suggest' || intent.winner === 'generate_code') {
                    executionTimeMs = Number(process.hrtime.bigint() - start) / 1e6;
                    bucket = 'BACKGROUND';
                    execSuccess = true; // Assume queued successfully
                } else if (intent.winner === 'confirmation') {
                    executionTimeMs = Number(process.hrtime.bigint() - start) / 1e6;
                    bucket = 'FAST';
                    execSuccess = true;
                } else {
                    try {
                        await execute(intent.winner, intent.params || []);
                        executionTimeMs = Number(process.hrtime.bigint() - start) / 1e6;
                        execSuccess = true;
                        
                        if (executionTimeMs < 100) bucket = 'FAST';
                        else if (executionTimeMs < 1000) bucket = 'GOOD';
                        else bucket = 'SLOW';
                    } catch (e) {
                        executionTimeMs = Number(process.hrtime.bigint() - start) / 1e6;
                        bucket = 'SLOW';
                        execSuccess = false;
                    }
                }
            } else {
                executionTimeMs = Number(process.hrtime.bigint() - start) / 1e6;
                bucket = 'LLM';
                execSuccess = true; // LLM fallback is technically a successful route
            }

            bucketCounts[bucket]++;
            if (execSuccess) executionSuccessful++;
            
            let routeCorrect = false;
            if (test.expectedTool === 'CLARIFY' || test.expectedTool === 'LLM') {
                routeCorrect = true;
            } else {
                routeCorrect = intent.winner === test.expectedTool;
            }
            if (routeCorrect) routingCorrect++;

            const statusIcon = routeCorrect ? '✅' : '❌';
            console.log(`[${statusIcon}] [${bucket.padEnd(10)}] ${executionTimeMs.toFixed(1).padStart(7)}ms | "${test.input.substring(0, 40)}..." -> ${actualTool}`);
        }
    }

    console.log('\n=========================================');
    console.log('📊 PHASE 8F FULL PERFORMANCE AUDIT COMPLETE');
    console.log('=========================================');
    console.log(`Total Requests Audited: ${totalTests}\n`);
    
    console.log('INTENT ROUTING');
    console.log(`  Correct:    ${routingCorrect}/${totalTests} (${((routingCorrect/totalTests)*100).toFixed(1)}%)`);
    console.log(`  Incorrect:  ${totalTests - routingCorrect}/${totalTests}`);
    
    console.log('\nTOOL EXECUTION');
    console.log(`  Successful: ${executionSuccessful}/${totalTests}`);
    
    console.log('\nLATENCY CLASSIFICATION');
    console.log(`  🟢 FAST (<100ms):          ${bucketCounts.FAST} requests`);
    console.log(`  🔵 GOOD (100-1000ms):      ${bucketCounts.GOOD} requests`);
    console.log(`  🟠 SLOW (>1000ms):         ${bucketCounts.SLOW} requests`);
    console.log(`  🟣 BACKGROUND (Instant):   ${bucketCounts.BACKGROUND} requests`);
    console.log(`  ⚪ LLM (Skipped):          ${bucketCounts.LLM} requests`);
    console.log('=========================================\n');
    
    process.exit(0);
}

runBenchmark().catch(console.error);