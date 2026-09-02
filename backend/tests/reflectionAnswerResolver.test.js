const assert = require('assert');
const {
    resolveReflectionAnswer,
    resolveField
} = require('../src/memory/reflectionAnswerResolver');

const relevantMemory = {
    reflectionScope: { strict: true, sessionIds: ['1201'], title: 'Redwood Retrieval' },
    reflections: [{
        session_id: 1201,
        session_title: 'Redwood Retrieval',
        summary: 'The session compared durable and temporary retrieval.',
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
    resolveReflectionAnswer('What did we discuss in that conversation?', relevantMemory),
    'The session compared durable and temporary retrieval.'
);
assert.strictEqual(
    resolveReflectionAnswer('Continue our chat about Redwood Retrieval.', relevantMemory),
    null
);
assert.strictEqual(
    resolveReflectionAnswer('What was that conversation called?', relevantMemory),
    'Redwood Retrieval'
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
assert.strictEqual(
    resolveReflectionAnswer('In our chat about Missing Title, what did we discuss?', {
        reflectionScope: { strict: true, reason: 'title_missing', sessionIds: [] },
        reflections: []
    }),
    'I could not find a completed conversation matching that title.'
);
assert.strictEqual(
    resolveReflectionAnswer('In our chat about Pending Work, what did we discuss?', {
        reflectionScope: {
            strict: true,
            reason: 'title',
            title: 'Pending Work',
            sessionIds: ['1211']
        },
        reflections: []
    }),
    'I found the conversation titled "Pending Work", but its reflection is not available yet.'
);

const planningMemory = {
    reflectionScope: { strict: true, sessionIds: ['1211'], title: 'Knowledge Library Planning' },
    reflections: [{
        session_id: 1211,
        decisions: [
            'I think our next priority should be cleaning the knowledge library',
            'I want to validate provenance first because old search memories may be unreliable',
            'Time-sensitive facts should expire or require reverification',
            'We shouldn\'t change the database schema yet'
        ]
    }]
};

assert.strictEqual(
    resolveReflectionAnswer('What did I explicitly say not to do yet?', planningMemory),
    'You said: “We shouldn\'t change the database schema yet”.'
);
assert.strictEqual(
    resolveReflectionAnswer('What did I say about time-sensitive information?', planningMemory),
    'You said: “Time-sensitive facts should expire or require reverification”.'
);
assert.strictEqual(
    resolveReflectionAnswer('What did I want to prioritize first, and why?', planningMemory),
    'You said: “I think our next priority should be cleaning the knowledge library” and “I want to validate provenance first because old search memories may be unreliable”.'
);
assert.strictEqual(
    resolveReflectionAnswer('What were my main concerns in our Knowledge Library Planning chat?', planningMemory),
    'You said: “I think our next priority should be cleaning the knowledge library”; “I want to validate provenance first because old search memories may be unreliable”; “Time-sensitive facts should expire or require reverification”; and “We shouldn\'t change the database schema yet”.'
);

console.log('reflectionAnswerResolver.test.js: all assertions passed');
