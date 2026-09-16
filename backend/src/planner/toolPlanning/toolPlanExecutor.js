const { execute } = require('../../tools/toolExecutor');
const permissionManager = require('../../permissions/permissionManager');
const searchPipeline = require('../searchPipeline');
const state = require('../state');

function isFailure(result) {
    return /^(?:error\b|tool execution failed:)/i.test(String(result || '').trim());
}

function formatToolName(name) {
    return String(name || 'tool').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

function formatResults(results) {
    return results.map((step, index) =>
        `Task ${index + 1} — ${formatToolName(step.toolName)}:\n${step.result}`
    ).join('\n\n');
}

function approvalPrompt(plan) {
    const protectedSteps = plan.steps.filter(step => permissionManager.check(step.toolName).requiresApproval);
    const names = protectedSteps.map(step => `${formatToolName(step.toolName)} (${step.clause})`);
    return `PERMISSION REQUIRED: This plan includes ${names.join(', ')}. Do you want me to run the full plan?`;
}

async function executeStep(step, {
    approved = false,
    runTool = execute,
    runSearch = async clause => {
        const queries = await searchPipeline.generateQueries(clause);
        const result = await searchPipeline.executeSearch(queries);
        return { queries, result };
    }
} = {}) {
    if (state.isSessionClosed()) throw new Error('The originating conversation is closed.');
    if (step.toolName === 'webSearch') {
        const { queries, result } = await runSearch(step.clause);
        state.lastSearchQuery = queries[0];
        return { ...step, result, status: isFailure(result) ? 'failed' : 'complete', isWebSearch: true };
    }

    const result = await runTool(step.toolName, step.args || [], { isApproved: approved });
    return { ...step, result, status: isFailure(result) ? 'failed' : 'complete', isWebSearch: false };
}

async function executeToolPlan(plan, options = {}) {
    const { approved = false } = options;
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length < 2) {
        throw new Error('A multi-tool plan requires at least two steps.');
    }

    const approvalSteps = plan.steps.filter(step => permissionManager.check(step.toolName).requiresApproval);
    if (approvalSteps.length > 0 && !approved) {
        return { status: 'approval_required', prompt: approvalPrompt(plan), plan };
    }

    const results = [];
    for (const step of plan.steps) {
        try {
            results.push(await executeStep(step, options));
        } catch (error) {
            results.push({
                ...step,
                result: `Error: ${error.message}`,
                status: 'failed',
                isWebSearch: step.toolName === 'webSearch'
            });
        }
    }

    const searchResults = results.filter(step => step.isWebSearch);
    return {
        status: 'complete',
        results,
        toolNames: results.map(step => step.toolName),
        toolResult: formatResults(results),
        hasWebSearch: searchResults.length > 0,
        searchEvidence: searchResults.map(step => step.result).join('\n\n'),
        searchQuery: searchResults.map(step => step.clause).join(' | '),
        failedCount: results.filter(step => step.status === 'failed').length,
        shortCircuit: searchResults.length === 0
    };
}

module.exports = {
    executeToolPlan,
    executeStep,
    formatResults,
    approvalPrompt,
    isFailure
};
