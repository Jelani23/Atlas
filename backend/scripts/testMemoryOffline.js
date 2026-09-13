// Explicit list: older files with similar names are live database audits.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tests = [
    'canonicalizationEvaluation.test.js', 'conversationContextRetrieval.test.js', 'generationCache.test.js',
    'knowledgeActiveFiltering.test.js', 'knowledgeAtomicityPlanner.test.js', 'knowledgeAuditReport.test.js',
    'knowledgeCleanupPlanner.test.js', 'knowledgeCleanupRepository.test.js', 'knowledgeDecompositionRepository.test.js',
    'knowledgeIngestionInspection.test.js', 'knowledgeIngestionManager.test.js', 'knowledgeIngestionMigration.test.js',
    'knowledgeIngestionRepository.test.js', 'knowledgeLifecycleIntegration.test.js', 'knowledgeMaintenance.test.js',
    'knowledgeMemoryAudit.test.js', 'knowledgeRetrievalPrecision.test.js', 'knowledgeReviewResolution.test.js',
    'knowledgeReviewResolutionMigration.test.js', 'knowledgeSemanticIngestion.test.js', 'knowledgeSql.test.js',
    'knowledgeTopicCleanup.test.js', 'knowledgeTopicPolicy.test.js', 'knowledgeVerificationEvaluator.test.js',
    'knowledgeVerificationOwnership.test.js', 'knowledgeVerificationPolicy.test.js', 'knowledgeVerificationRouting.test.js',
    'knowledgeVerificationService.test.js', 'knowledgeVerificationWrites.test.js', 'memoryAssertionBoundary.test.js',
    'memoryCacheInvalidation.test.js', 'memoryCanonicalization.test.js', 'memoryCanonicalizationManager.test.js',
    'memoryCanonicalizationSafety.test.js', 'memoryComparisonModelPath.test.js', 'memoryComparisonRetry.test.js',
    'memoryEquivalencePolicy.test.js', 'memoryIdentityComparison.test.js', 'memoryVersionScope.test.js',
    'ollamaPayload.test.js', 'proceduralAndProjectMemoryAudit.test.js', 'reflectionAnswerResolver.test.js', 'reflectionEngine.test.js',
    'reflectionWorker.test.js', 'trustedKnowledgeGrounding.test.js',
    'projectExtractionScope.test.js', 'sessionWorkingContext.test.js', 'fictionalCleanup.test.js', 'memoryModelAdapter.test.js',
    'modelRouting.test.js', 'reasoningPolicy.test.js', 'responseRecovery.test.js', 'thinkFilter.test.js',
    'multiToolPlan.test.js', 'plannerMultiToolRouting.test.js', 'plannerNormalizerGrounding.test.js', 'toolArguments.test.js',
    'arithmeticExpression.test.js', 'toolResultPresenter.test.js', 'profileRecall.test.js',
    'toolRequestBoundary.test.js', 'unitConversion.test.js'
];
const failures = [];
for (const test of tests) {
    const script = "globalThis.fetch = async () => { throw new Error('Network disabled in offline memory tests'); }; require(process.argv[1]);";
    const result = spawnSync(process.execPath, ['-e', script, path.join(__dirname, '../tests', test)], {
        encoding: 'utf8', timeout: 30000,
        env: { ...process.env, ATLAS_MODEL_PROVIDER: 'ollama', OLLAMA_MODEL_MEMORY: '', SEMANTIC_MEMORY_CANONICALIZATION: 'true' }
    });
    if (result.status !== 0) {
        failures.push(test);
        console.error(test, result.error?.message || '', result.stdout, result.stderr);
    }
}
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
