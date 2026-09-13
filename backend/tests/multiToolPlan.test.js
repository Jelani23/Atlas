const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
    compileToolPlan,
    validateSemanticPlan
} = require('../src/planner/toolPlanning/toolPlanCompiler');
const { executeToolPlan } = require('../src/planner/toolPlanning/toolPlanExecutor');
const { deriveIntentCategory } = require('../src/intent/intentCategory');
const {
    createSemanticToolPlanner,
    buildToolCatalog
} = require('../src/planner/toolPlanning/semanticToolPlanner');

async function testCompilation() {
    const lowRisk = await compileToolPlan(
        'List my notes and search the knowledge library for Qwen models'
    );
    assert.strictEqual(lowRisk.status, 'ready');
    assert.deepStrictEqual(lowRisk.plan.steps.map(step => step.toolName), [
        'listNotes',
        'searchKnowledge'
    ]);

    const explicitMutation = await compileToolPlan(
        'Reverify knowledge record 77-79 and then search the knowledge library for Qwen models'
    );
    assert.strictEqual(explicitMutation.status, 'ready');
    assert.deepStrictEqual(explicitMutation.plan.steps[0].args, [77, 78, 79]);

    const implicitMutation = await compileToolPlan(
        'Reverify knowledge record 42 and search the knowledge library for Qwen models'
    );
    assert.strictEqual(implicitMutation.status, 'blocked');

    const ordinarySearch = await compileToolPlan(
        'Search the web for Qwen and summarize the results'
    );
    assert.strictEqual(ordinarySearch.status, 'none');

    const dependency = await compileToolPlan(
        'Find the file package.json and then read it'
    );
    assert.strictEqual(dependency.status, 'blocked');

    const conversation = await compileToolPlan(
        'We compared automatic processing and manual processing.'
    );
    assert.strictEqual(conversation.status, 'none');

    const contextThenTool = await compileToolPlan(
        'I like Qwen. Search the web for its latest release.'
    );
    assert.strictEqual(contextThenTool.status, 'none');

    const semantic = await compileToolPlan(
        'Show every memo; check online for Qwen releases',
        {
            semanticPlanner: async () => ({
                steps: [
                    { toolName: 'listNotes', args: [], confidence: 0.96 },
                    { toolName: 'webSearch', args: ['Qwen releases'], confidence: 0.95 }
                ]
            })
        }
    );
    assert.strictEqual(semantic.status, 'ready');
    assert(semantic.plan.steps.every(step => step.source === 'semantic'));

    const recovered = await compileToolPlan('Convert 5 kilometers to meters; Count the characters in Atlas', {
        semanticPlanner: async () => ({ steps: [
            { toolName: 'convertUnit', args: [5, 'kilometers', 'meters'], confidence: 0.99 },
            { toolName: 'characterCount', args: ['Atlas'], confidence: 0.99 }
        ] })
    });
    assert.equal(recovered.status, 'ready');
    assert.deepEqual(recovered.plan.steps.map(step => [step.toolName, step.args]), [
        ['convertUnit', [5, 'kilometers', 'meters']], ['characterCount', ['Atlas']]
    ]);

    const tooMany = await compileToolPlan(
        Array.from({ length: 9 }, () => 'list my notes').join('; ')
    );
    assert.strictEqual(tooMany.status, 'blocked');
}

function testSemanticBoundary() {
    const lowRisk = validateSemanticPlan({
        steps: [
            { toolName: 'listNotes', args: [], confidence: 0.96 },
            { toolName: 'webSearch', args: ['Qwen releases'], confidence: 0.95 }
        ]
    }, ['Show every memo', 'Check online for Qwen releases']);
    assert(lowRisk);
    assert(lowRisk.steps.every(step => step.source === 'semantic'));

    const uncorroboratedDelete = validateSemanticPlan({
        steps: [
            { toolName: 'listNotes', args: [], confidence: 0.96 },
            { toolName: 'deleteNote', args: ['scratchpad'], confidence: 0.99 }
        ]
    }, ['Show every memo', 'Get rid of scratchpad']);
    assert.strictEqual(uncorroboratedDelete, null);

    for (const confidence of [undefined, null, '0.99', NaN, Infinity, 1.01, -1, 0.89]) {
        assert.strictEqual(validateSemanticPlan({ steps: [
            { toolName: 'listNotes', args: [], confidence },
            { toolName: 'webSearch', args: ['Qwen releases'], confidence: 0.95 }
        ] }, ['Show every memo', 'Check online for Qwen releases']), null,
        `Invalid confidence must not authorize a plan: ${String(confidence)}`);
    }
    assert.strictEqual(validateSemanticPlan({ steps: [null, null] }, ['List notes', 'List notes']), null);

    const clauses = ['Delete the note called scratchpad', 'List my notes'];
    const route = () => ({ state: 'DETERMINISTIC', winner: 'deleteNote', params: ['scratchpad'] });
    const deletionProposal = args => ({ steps: [
        { toolName: 'deleteNote', args, confidence: 0.99 },
        { toolName: 'listNotes', args: [], confidence: 0.99 }
    ] });
    assert(validateSemanticPlan(deletionProposal(['scratchpad']), clauses, route));
    assert.strictEqual(validateSemanticPlan(deletionProposal(['release plan']), clauses, route), null,
        'Matching the tool name must not authorize a different mutation target');
    assert.strictEqual(validateSemanticPlan(deletionProposal([]), clauses, route), null);
}

async function testSemanticProposalAdapter() {
    let prompt = '';
    const planner = createSemanticToolPlanner({
        adapter: {
            complete: async messages => {
                prompt = messages[1].content;
                return JSON.stringify({
                    steps: [
                        { toolName: 'listNotes', args: [], confidence: 0.97 },
                        { toolName: 'webSearch', args: ['Qwen'], confidence: 0.96 }
                    ]
                });
            }
        }
    });
    const proposal = await planner({
        message: 'Show every memo; check online for Qwen',
        segments: ['Show every memo', 'check online for Qwen'],
        schemas: [
            { name: 'listNotes', domain: 'NOTES', triggers: ['list notes'] },
            { name: 'webSearch', domain: 'WEB', triggers: ['search the web'] }
        ]
    });
    assert.strictEqual(proposal.steps.length, 2);
    assert(prompt.includes('conversational, ambiguous, missing a target, or unsupported'));
    assert.deepStrictEqual(buildToolCatalog([
        { name: 'listNotes', domain: 'NOTES', triggers: ['list notes'] }
    ])[0].examples, ['list notes']);
}

async function testExecutionQueue() {
    const calls = [];
    const plan = {
        steps: [
            { toolName: 'listNotes', args: [], clause: 'List notes' },
            { toolName: 'searchKnowledge', args: ['Qwen'], clause: 'Search knowledge' }
        ]
    };
    const result = await executeToolPlan(plan, {
        runTool: async (toolName, args) => {
            calls.push([toolName, args]);
            return `${toolName} complete`;
        }
    });
    assert.deepStrictEqual(calls.map(call => call[0]), ['listNotes', 'searchKnowledge']);
    assert.strictEqual(result.shortCircuit, true);
    assert(result.toolResult.includes('Task 1'));
    assert(result.toolResult.includes('Task 2'));

    const mixed = await executeToolPlan({
        steps: [
            { toolName: 'webSearch', args: ['Qwen'], clause: 'Search the web for Qwen' },
            { toolName: 'listNotes', args: [], clause: 'List notes' }
        ]
    }, {
        runSearch: async () => ({
            queries: ['Qwen'],
            result: 'SEARCH_STATUS: RESULTS_FOUND\nSource URL: https://example.com/qwen'
        }),
        runTool: async () => 'Notes listed'
    });
    assert.strictEqual(mixed.hasWebSearch, true);
    assert.strictEqual(mixed.shortCircuit, false);
    assert(mixed.searchEvidence.includes('RESULTS_FOUND'));
    assert.strictEqual(
        deriveIntentCategory({
            toolResult: {
                needsTool: true,
                toolName: 'multi_tool',
                toolNames: ['webSearch', 'listNotes']
            }
        }),
        'search'
    );

    const continued = [];
    const partialFailure = await executeToolPlan(plan, {
        runTool: async toolName => {
            continued.push(toolName);
            if (toolName === 'listNotes') throw new Error('notes unavailable');
            return 'Knowledge searched';
        }
    });
    assert.deepStrictEqual(continued, ['listNotes', 'searchKnowledge']);
    assert.strictEqual(partialFailure.failedCount, 1);
    const reportedFailure = await executeToolPlan(plan, {
        runTool: async toolName => toolName === 'listNotes' ? 'Error reading notes: unavailable' : 'Knowledge searched'
    });
    assert.strictEqual(reportedFailure.failedCount, 1);
    assert.strictEqual(reportedFailure.results[0].status, 'failed');
}

async function testApprovalPreflight() {
    let executed = false;
    const result = await executeToolPlan({
        steps: [
            { toolName: 'listNotes', args: [], clause: 'List notes' },
            { toolName: 'deleteNote', args: ['scratchpad'], clause: 'Delete scratchpad' }
        ]
    }, {
        runTool: async () => {
            executed = true;
            return 'unexpected';
        }
    });
    assert.strictEqual(result.status, 'approval_required');
    assert.strictEqual(executed, false);
    assert(result.prompt.includes('delete note'));
}

async function run() {
    await testCompilation();
    testSemanticBoundary();
    await testSemanticProposalAdapter();
    await testExecutionQueue();
    await testApprovalPreflight();
    console.log('multiToolPlan.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
