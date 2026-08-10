// backend/scripts/auditIdentity.js
const fs = require('fs');
const path = require('path');

const scanDir = path.join(__dirname, '../src');
const targetWords = ['atlas', 'qwen', 'assistant name', 'who i am', 'identity', 'self description'];

const results = {
    semantic: [],
    project: [],
    model: []
};

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        
        // Skip comments for cleaner results, but keep code
        if (lowerLine.trim().startsWith('//') || lowerLine.trim().startsWith('*')) return;

        targetWords.forEach(word => {
            if (lowerLine.includes(word)) {
                let category = 'semantic';
                // Classify project paths or env vars
                if (lowerLine.includes('atlas_') || lowerLine.includes('path.join') || lowerLine.includes('process.env') || lowerLine.includes('require(') || lowerLine.includes('atlas-backend') || lowerLine.includes('atlas-app')) {
                    category = 'project';
                }
                // Classify model references
                if (lowerLine.includes('qwen') || lowerLine.includes('model')) {
                    category = 'model';
                }

                results[category].push({
                    file: path.relative(scanDir, filePath),
                    line: index + 1,
                    text: line.trim()
                });
            }
        });
    });
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith('.js')) {
            scanFile(fullPath);
        }
    }
}

walk(scanDir);

console.log('🔍 IDENTITY AUDIT RESULTS\n');
console.log('--- 🧠 SEMANTIC (Needs Review) ---');
results.semantic.forEach(r => console.log(`[${r.file}:${r.line}] ${r.text}`));

console.log('\n--- 🏗️ PROJECT (Keep as ATLAS OS) ---');
results.project.forEach(r => console.log(`[${r.file}:${r.line}] ${r.text}`));

console.log('\n--- 🤖 MODEL (Needs Separation) ---');
results.model.forEach(r => console.log(`[${r.file}:${r.line}] ${r.text}`));