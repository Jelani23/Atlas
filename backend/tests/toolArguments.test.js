const assert = require('node:assert/strict');
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
const { getToolArguments, validateToolArguments, canonicalizeToolArguments } = require('../src/tools/toolArguments');
const { getExecutableSchemas, validateSemanticPlan } = require('../src/planner/toolPlanning/toolPlanCompiler');
const { buildToolCatalog } = require('../src/planner/toolPlanning/semanticToolPlanner');

for (const schema of getExecutableSchemas().values()) {
    assert(Array.isArray(getToolArguments(schema.name)), `Missing contract for executable tool ${schema.name}`);
}
for (const [name, args] of [
    ['calculate', ['2 + 2']], ['wordCount', ['hello world']], ['listNotes', []],
    ['convertUnit', [5, 'km', 'm']], ['extractKeywords', ['hello world']],
    ['extractKeywords', ['hello world', 3]], ['readCode', [['src/index.js', 'package.json']]],
    ['readCode', ['src/index.js']], ['listCode', []], ['listCode', ['']],
    ['reverifyKnowledge', [77, 78, 79]], ['renameNote', ['old_plan', 'new_plan']]
]) assert(validateToolArguments(name, args), `Valid inputs rejected: ${name} ${JSON.stringify(args)}`);

for (const [name, args] of [
    ['calculate', []], ['calculate', ['']], ['calculate', [4]], ['calculate', ['two plus two']],
    ['calculate', ['18 times 7']], ['calculate', ['2 + 2abc']],
    ['webSearch', ['   ']], ['wordCount', ['hello', 'extra']], ['listNotes', ['extra']],
    ['convertUnit', ['5', 'km', 'm']], ['convertUnit', [NaN, 'km', 'm']],
    ['convertUnit', [Infinity, 'km', 'm']], ['extractKeywords', ['hello world', 0]],
    ['extractKeywords', ['hello world', 1.5]], ['extractKeywords', ['hello world', null]],
    ['readCode', [[]]], ['readCode', [['src/index.js', 42]]],
    ['reverifyKnowledge', []], ['reverifyKnowledge', [[77, 78]]],
    ['reverifyKnowledge', [77, -1]], ['reverifyKnowledge', Array(21).fill(77)],
    ['unknownTool', []], ['toString', []], ['deleteNote', [null]], ['deleteNote', ['USE_LAST']],
    ['renameNote', ['old_plan']], ['webSearch', ['x'.repeat(20001)]]
]) assert.equal(validateToolArguments(name, args), false, `Invalid inputs accepted: ${name} ${JSON.stringify(args)}`);

const catalog = buildToolCatalog([...getExecutableSchemas().values()]);
assert.deepEqual(canonicalizeToolArguments('appendNote', ['release plan', 'Keep these spaces.']), ['release_plan', 'Keep these spaces.']);
assert.deepEqual(canonicalizeToolArguments('webSearch', ['release plan']), ['release plan']);
assert.deepEqual(canonicalizeToolArguments('calculate', ['two plus two']), ['2 + 2']);
assert.deepEqual(canonicalizeToolArguments('wordCount', ['two plus two']), ['two plus two']);
const renamed = validateSemanticPlan({ steps: [
    { toolName: 'renameNote', args: ['old plan', 'new plan'], confidence: 0.99 },
    { toolName: 'listNotes', args: [], confidence: 0.99 }
] }, ['Rename note old plan to new plan', 'List notes'], () => ({
    state: 'DETERMINISTIC', winner: 'renameNote', params: ['old_plan', 'new_plan']
}));
assert.deepEqual(renamed.steps[0].args, ['old_plan', 'new_plan']);
assert.deepEqual(catalog.find(tool => tool.name === 'calculate').parameters, getToolArguments('calculate'));
assert.deepEqual(catalog.find(tool => tool.name === 'listNotes').parameters, []);
assert.equal(buildToolCatalog([{ name: 'unknownTool' }]).length, 0);

// The integration boundary must consult the contracts, not just the helper.
const clauses = ['Search the web for SQLite', 'List notes'];
for (const args of [[], [7], [''], ['SQLite', 'extra']]) {
    assert.equal(validateSemanticPlan({ steps: [
        { toolName: 'webSearch', args, confidence: 0.99 },
        { toolName: 'listNotes', args: [], confidence: 0.99 }
    ] }, clauses), null);
}
assert(validateSemanticPlan({ steps: [
    { toolName: 'webSearch', args: ['SQLite'], confidence: 0.99 },
    { toolName: 'listNotes', args: [], confidence: 0.99 }
] }, clauses));
console.log('toolArguments.test.js: all assertions passed');
