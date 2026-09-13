const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Capture before the first model request. Reports must identify the code that
// was loaded, even if a developer edits source while a long evaluation runs.
function captureEvaluationMetadata(cases) {
    const sourceFiles = [
        'src/memory/memoryIdentityComparison.js', 'src/memory/memoryCanonicalizer.js', 'src/memory/memoryAssertionBoundary.js',
        'src/memory/memoryEquivalencePolicy.js', 'src/memory/canonicalizationEvaluation.js',
        'src/models/providers/ollama.js', 'src/models/memoryModelAdapter.js'
    ];
    const hash = value => createHash('sha256').update(value).digest('hex');
    const sources = Object.fromEntries(sourceFiles.map(file => {
        const content = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
        return [file, { sha256: hash(content), content }];
    }));
    return {
        model: process.env.OLLAMA_MODEL_MEMORY?.trim() || process.env.OLLAMA_MODEL || 'qwen3.5:4b',
        context: Number(process.env.OLLAMA_NUM_CTX) || 8192,
        temperature: 0, think: false, requestTokenLimits: [600, 1200], deadlineMs: 30000,
        fixtureSha256: hash(JSON.stringify(cases)), cases, sources
    };
}

module.exports = { captureEvaluationMetadata };
