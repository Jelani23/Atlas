const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SEMANTIC_MULTI_TOOL_PLANNING = 'false';
globalThis.fetch = async () => { throw new Error('No network in tool boundary tests'); };
const calls = [];
require('../src/tools/toolExecutor').execute = async (tool, args) => {
    calls.push({ tool, args });
    return 'Simulated successful execution';
};
const { resolve } = require('../src/intent/intentResolver');
const { fastRegexNormalizer, normalizeTask } = require('../src/planner/normalizer');
const { validateSemanticPlan } = require('../src/planner/toolPlanning/toolPlanCompiler');
const { route } = require('../src/planner/planner');
const state = require('../src/planner/state');
const permissions = require('../src/permissions/permissionManager');
const { confirmationDecision, isNonExecutingToolMention } = require('../src/intent/toolRequestBoundary');

async function main() {
    for (const message of [
        'Explain how to rename a variable in JavaScript',
        'I was wondering how to rename the note called old plan to new plan',
        'I was wondering how to delete a note',
        'Before doing anything explain how to delete the note called scratchpad',
        'I am curious how to calculate two plus two',
        'Could you tell me how to delete a note',
        '"Delete the note called scratchpad"',
        'What does character count mean',
        'I am not asking you to calculate anything explain what a percentage represents',
        'Explain how to delete the note called scratchpad',
        'Could you explain how to delete the note called scratchpad',
        'What tools do you have',
        'What are all the tools you have available?',
        'Can you list all your tools',
        'What arguments does appendNote need',
        'How does searchKnowledge work',
        'What tools do you have and what are their limitations',
        'Do you have file access',
        'Can you read your own code',
        'You understand the current state of your TTS right',
        'Do you have access to web search or only your training knowledge',
        'Do not delete the note called scratchpad',
        'I do not want you to delete the note called scratchpad',
        'Could you please not delete the note called scratchpad',
        "Please don't rename the note called old plan to new plan",
        'We discussed searching notes',
        'How do I calculate 2 + 2'
    ]) {
        assert.equal(resolve(message).winner, null, message);
        assert.equal(fastRegexNormalizer(message).intent, 'none', message);
        assert.equal((await normalizeTask(message)).intent, 'none', message);
        assert.equal((await route(resolve(message), message)).needsTool, false, message);
        assert.equal(state.pendingAction, null);
    }
    assert.equal(calls.length, 0);
    assert.equal(isNonExecutingToolMention('I was wondering if you could rename the note called old to new'), false);
    assert.equal(isNonExecutingToolMention('Could you calculate two plus two'), false);
    // A semantic model's high confidence cannot authorize a negated clause.
    assert.equal(validateSemanticPlan({ steps: [
        { toolName: 'calculate', args: ['2 + 2'], confidence: 1 },
        { toolName: 'wordCount', args: ['hello world'], confidence: 1 }
    ] }, ['Do not calculate 2 + 2', 'Count the words in hello world']), null);
    assert.equal((await route(resolve('Calculate 2 + 2'), 'Calculate 2 + 2')).toolName, 'calculate');
    assert.deepEqual(calls.pop(), { tool: 'calculate', args: ['2 + 2'] });
    const deletion = 'Delete the note called scratchpad';
    assert.equal((await route(resolve(deletion), deletion)).toolName, 'permission_request');
    assert.equal(calls.length, 0);
    await route(resolve('Explain how to delete the note called scratchpad'), 'Explain how to delete the note called scratchpad');
    assert(state.pendingAction, 'An explanation is not approval of an existing request');
    const denied = 'No do not delete it even if I said yes earlier';
    await route(resolve(denied), denied);
    assert.equal(state.pendingAction, null);
    assert.equal(calls.length, 0);
    await route(resolve(deletion), deletion);
    await route(resolve('Yes please'), 'Yes please');
    assert.deepEqual(calls.pop(), { tool: 'deleteNote', args: ['scratchpad'] });
    for (const text of ['Yes but do not delete it', "Please don't delete it", 'Yeah no cancel that', 'Could you please not delete it']) {
        assert.equal(confirmationDecision(text), false);
    }
    for (const text of ['The note says yes', 'I am sure that explains it']) {
        assert.equal(confirmationDecision(text), null);
    }
    // LLM permission queue follows the same denial-first policy.
    let decision;
    permissions.pendingRequests.set('fixture', { toolName: 'deleteNote', resolve: value => { decision = value; } });
    assert.equal(permissions.handlePermissionResponse('The note says yes'), false);
    assert.equal(permissions.handlePermissionResponse(denied), true);
    assert.equal(decision, false);
    console.log('Tool route boundaries and approval/denial tests passed without executing tools.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
