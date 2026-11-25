const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractOperations, attachOperations } = require('../src/reasoning/evidencePilot/operations');
const { reviewClaims } = require('../src/reasoning/evidencePilot/claimReview');
const { validate } = require('../src/reasoning/evidencePilot/context');
const { hash } = require('../src/reasoning/evidencePilot/collector');

// Parsed only; deliberately unsafe to execute.
const source = `throw Error('DO NOT EXECUTE');
async function run(task) {
  if (!task) return;
  try {
    await work();
    if (task.cancelled) return;
    task.status = 'DONE';
    bus.emit('done');
  } catch (e) { bus.emit('failed'); }
  if (task.ready) { task.status = 'CANCELLED'; bus.emit('cancel'); }
  else { bus.emit('skip'); }
  if (task.ready) setTimeout(() => bus.emit('later'));
  task.ready && bus.emit('conditional');
}
`;
const extracted = extractOperations('src/a.js', source, hash(source));
const event = key => extracted.facts.find(f => f.key === `'${key}'`);
assert(event('done').priorExits.some(s => s.includes('!task')));
assert(event('done').priorExits.some(s => s.includes('task.cancelled')));
assert(event('done').priorAwaits.includes('await work()'));
assert(event('done').regions.some(s => s.startsWith('try body')));
assert(event('failed').regions.includes('catch handler'));
assert.deepEqual(event('cancel').conditions, [{ expression: 'task.ready', branch: 'then' }]);
assert.deepEqual(event('skip').conditions, [{ expression: 'task.ready', branch: 'else' }]);
assert.equal(event('later').owner, '<callback>');
assert.deepEqual(event('later').conditions, []); // Outer scheduling condition isn't a callback execution guarantee.
assert(event('conditional').regions.some(s => s.includes('&&')));
for (const f of extracted.facts) assert.equal(source.slice(f.location.start, f.location.end), f.source);
assert.equal(extractOperations('broken.js', 'function {', 'x').facts.length, 0);
assert.equal(extractOperations('computed.js', `bus['emit']('x');`, 'x').facts.length, 0);
const switchFacts = extractOperations('switch.js', `switch(x){case 1: bus.emit('x'); break; default: bus.emit('y');}`, 'x');
assert(switchFacts.facts[0].regions.includes('case 1'));
assert(switchFacts.facts[1].regions.includes('default case'));

const realPath = 'src/tasks/taskManager.js';
const real = fs.readFileSync(path.resolve(__dirname, '..', realPath), 'utf8');
const operations = extractOperations(realPath, real, hash(real));
const complete = operations.facts.find(f => f.key === 'EventTypes.TASK_COMPLETED');
const failed = operations.facts.find(f => f.key === 'EventTypes.TASK_FAILED');
const cancel = operations.facts.find(f => f.key === 'EventTypes.TASK_CANCELLED');
assert(complete && failed && cancel);
assert(complete.priorAwaits.some(s => s.includes('workFn')));
assert(complete.priorExits.some(s => s.includes('TaskStates.CANCELLED')));
assert(failed.regions.includes('catch handler'));
assert(cancel.conditions[0].expression.includes('TaskStates.CREATED'));
const packet = { target: realPath, evidence: [{ id: 'e1', kind: 'excerpt', text: real }], operations };
const claims = [
    { text: 'Task creation emits a TASK_CREATED event, but the source code does not explicitly emit an event upon task completion or failure.', evidenceIds: ['e1'] },
    { text: 'cancelTask always sets status to CANCELLED regardless of state.', evidenceIds: ['e1'] },
    { text: 'cancelTask sets status to CANCELLED and emits TASK_CANCELLED.', evidenceIds: ['e1'] },
    { text: 'Tests confirm cancellation works.', evidenceIds: ['e1'] },
    { text: 'The file has unresolved syntax errors.', evidenceIds: ['e1'] },
    { text: 'The class coordinates tasks; this purpose is an inference.', evidenceIds: ['e1'] }
];
const reviewed = reviewClaims(claims, packet);
assert(reviewed.slice(0, 5).every(c => c.review.status === 'withheld'));
assert.equal(reviewed[5].review.status, 'unverified');
const wrongAnchor = reviewClaims([{ text: 'Source includes EventTypes.TASK_COMPLETED.', evidenceIds: ['other'] }],
    { ...packet, evidence: [...packet.evidence, { id: 'other', kind: 'excerpt', text: 'const unrelated = 1;' }] })[0];
assert.equal(wrongAnchor.review.status, 'withheld');
assert(wrongAnchor.review.reasons.some(r => r.includes('absent from the cited excerpts')));
for (const text of [
    'Test source simulates cancellation, but no test results are inferred as executed.',
    'Source registers listeners, without runtime reachability proof.',
    'Tests mock requests but do not prove execution or test result success.',
    'Task creation executes work only if no parentTaskId is provided.',
    '_executeTask guards against double execution by checking RUNNING status before setting it.'
]) assert.equal(reviewClaims([{ text, evidenceIds: ['e1'] }], packet)[0].review.status, 'unverified', text);
const result = validate(JSON.stringify({ claims, unknowns: [] }), packet);
assert.equal(result.claims.length, 1);
assert.equal(result.withheldClaims.length, 5);
assert.equal(result.observedOperations, operations);
assert.throws(() => validate(JSON.stringify({ claims: claims.slice(0, 1), unknowns: [] }), packet), /all claims/);
// Passing the pattern filter is explicitly not proof of truth.
assert.equal(reviewClaims([{ text: 'The code launches a rocket.', evidenceIds: ['e1'] }], packet)[0].review.semanticSupport, 'not_verified');
const bounded = { target: realPath, evidence: [], omitted: {} };
attachOperations(bounded, { snapshot: { files: { [realPath]: { source: real, hash: hash(real) } } }, records: { [realPath]: { operations } } }, 5000);
assert(JSON.stringify(bounded).length <= 5000);
assert(bounded.operations.omitted > 0);
for (const key of ['EventTypes.TASK_COMPLETED', 'EventTypes.TASK_FAILED', 'EventTypes.TASK_CANCELLED'])
    assert(bounded.operations.facts.some(f => f.key === key), `Guarded event displaced from bounded inventory: ${key}`);
console.log('Conditional operations, source spans, callback boundaries, real task events and conservative claim withholding passed.');
