const assert = require('assert');
const {
    resolveReflectionAnswer,
    resolveField
} = require('../src/memory/reflectionAnswerResolver');

const relevantMemory = {
    reflectionScope: { strict: true, sessionIds: ['1201'] },
    reflections: [{
        session_id: 1201,
        anchors: ['test_label: Redwood', 'session_theme: retrieval split'],
        comparisons: ['durable database retrieval vs temporary in-memory retrieval'],
        decisions: ['We selected durable database retrieval'],
        open_loops: []
    }]
};

assert.strictEqual(resolveField('What remained to be verified?'), 'open_loops');
assert.strictEqual(
    resolveReflectionAnswer('What remained to be verified?', relevantMemory),
    'No unresolved work was recorded in that conversation.'
);
assert.strictEqual(
    resolveReflectionAnswer('What was the reflection test label?', relevantMemory),
    'Redwood'
);
assert.strictEqual(
    resolveReflectionAnswer('What two retrieval approaches did we compare?', relevantMemory),
    'durable database retrieval vs temporary in-memory retrieval'
);
assert.strictEqual(
    resolveReflectionAnswer('Which approach did we select?', relevantMemory),
    'We selected durable database retrieval'
);
assert.strictEqual(
    resolveReflectionAnswer('What remained?', {
        ...relevantMemory,
        reflections: [{ ...relevantMemory.reflections[0], open_loops: ['Verify restart scope'] }]
    }),
    'Verify restart scope'
);
assert.strictEqual(
    resolveReflectionAnswer('What remained?', {
        ...relevantMemory,
        reflectionScope: { strict: false },
    }),
    null
);

console.log('reflectionAnswerResolver.test.js: all assertions passed');
