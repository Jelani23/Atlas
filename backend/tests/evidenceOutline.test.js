const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractOperations } = require('../src/reasoning/evidencePilot/operations');
const { hash } = require('../src/reasoning/evidencePilot/collector');
const outline = require('../src/reasoning/evidencePilot/outline');
const { generationProfile } = require('../src/reasoning/evidencePilot/generation');
const { renderReview } = require('../src/reasoning/evidencePilot/reviewReport');
const target = 'src/tasks/taskManager.js';
const source = fs.readFileSync(path.resolve(__dirname, '..', target), 'utf8');
const operations = extractOperations(target, source, hash(source));
const cancel = operations.facts.find(f => f.key === 'EventTypes.TASK_CANCELLED');
const failed = operations.facts.find(f => f.key === 'EventTypes.TASK_FAILED');
const packet = { target, evidence: [{ id: 'e0', kind: 'excerpt', text: source }, { id: 'e1', kind: 'file' }], operations };
const answer = { purpose: [{ text: 'This class coordinates background task bookkeeping; purpose is inferred.', evidenceIds: ['e0'] }],
    operationIds: [cancel.id, failed.id], unknowns: [] };
const validated = outline.validate(JSON.stringify(answer), packet);
assert.deepEqual(validated.selectedOperations, [cancel, failed]);
assert.notEqual(validated.selectedOperations[0], cancel);
assert(validated.selectedOperations[0].conditions[0].expression.includes('task &&'));
assert(validated.selectedOperations[0].conditions[0].expression.includes('CREATED'));
assert(validated.selectedOperations[1].regions.includes('catch handler'));
assert(validated.unselectedOperationIds.length > 0);
assert.equal(validated.status, 'MODEL_INTERPRETATION_UNVERIFIED');
for (const bad of [
    { ...answer, operationIds: ['invented'] }, { ...answer, operationIds: [cancel.id, cancel.id] },
    { ...answer, operationIds: [] }, { ...answer, conditions: [] },
    { ...answer, operationIds: [{ id: cancel.id, conditions: [] }] },
    { ...answer, purpose: [{ text: 'x', evidenceIds: ['e1'] }] },
    { ...answer, purpose: [{ text: 'x', evidenceIds: ['invented'] }] },
    { ...answer, unknowns: ['x'.repeat(801)] }
]) assert.throws(() => outline.validate(JSON.stringify(bad), packet));
const noPurpose = outline.validate(JSON.stringify({ ...answer, purpose: [{ text: 'No completion events are emitted.', evidenceIds: ['e0'] }] }), packet);
assert.equal(noPurpose.claims.length, 0);
assert.equal(noPurpose.withheldClaims.length, 1);
for (const text of [
    'Enforces strict bounds on request duration (1s-10min) and response size (2MB) before completion.',
    'Provides mechanisms to cancel, abort, and interrupt tasks by updating status flags and emitting cancellation events.',
    'The minimum timeout is one second.',
    'Stops arbitrary work when cancellation is requested.'
]) {
    const review = outline.validate(JSON.stringify({ ...answer, purpose: [{ text, evidenceIds: ['e0'] }] }), packet);
    assert.equal(review.claims.length, 0, text);
    assert.equal(review.withheldClaims.length, 1);
    assert.deepEqual(review.selectedOperations, [cancel, failed]);
}
assert(operations.facts.some(f => f.kind === 'cancellation_probe' && f.source.includes('task.status === TaskStates.CANCELLED')));
const transport = fs.readFileSync(path.resolve(__dirname, '../src/models/providers/ollamaEnvelopeTransport.js'), 'utf8');
const transportOps = extractOperations('transport.js', transport, hash(transport));
const numeric = transportOps.facts.find(f => f.kind === 'numeric_guard');
assert(numeric.predicate.includes('timeoutMs<1'));
assert(numeric.predicate.includes('timeoutMs>600000'));
assert(numeric.predicate.includes('Number.isInteger(timeoutMs)'));
assert.equal(transport.slice(numeric.location.start, numeric.location.end), numeric.source);
assert(numeric.interpretation.includes('units'));
const calls = extractOperations('calls.js', 'function go(controller) { if (ready) controller.abort(); }', 'fixture');
assert.equal(calls.facts[0].kind, 'cancellation_call');
assert.equal(calls.facts[0].conditions[0].expression, 'ready');
assert(calls.facts[0].interpretation.includes('not established'));
assert.deepEqual(noPurpose.selectedOperations, [cancel, failed]);
const noFacts = { ...packet, operations: { facts: [], omitted: 0 } };
assert.equal(outline.schema(noFacts).properties.operationIds.maxItems, 0);
assert.equal(outline.validate(JSON.stringify({ ...answer, operationIds: [] }), noFacts).selectedOperations.length, 0);
assert.throws(() => outline.validate(JSON.stringify({ purpose: [], operationIds: [], unknowns: [] }), noFacts));
assert.notEqual(generationProfile('outline').summaryKey, generationProfile('summary').summaryKey);
assert.equal(generationProfile('outline').summaryKey, generationProfile('outline', packet).summaryKey);
assert.equal(generationProfile('outline').generation.think, false);
const report = renderReview([{ target, status: 'unverified_summary', snapshotVersion: 'test-fixture', operations, interpretation: validated }]);
assert(report.includes('TASK_COMPLETED')); // Unselected operations remain visible.
assert(report.includes('task &&'));
assert(report.includes('catch handler'));
assert(report.includes('not live knowledge'));
const unsafeReport = renderReview([{ target: '<script>oops</script>', operations: { facts: [{ ...cancel, source: '```\n# source data\n```' }] } }]);
assert(!unsafeReport.includes('<script>'));
assert(unsafeReport.includes('````text'));
console.log('Operation outline: exact guard preservation, unknown/duplicate/tampered IDs, citations, empty inventories and readable review passed.');
