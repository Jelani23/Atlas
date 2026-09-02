const assert = require('assert');
const {
    extractTitleHint,
    looksLikeTitleReference,
    resolveSessionTitleReference
} = require('../src/memory/sessionTitleResolver');

const sessions = [
    { id: 1176, title: 'Willow Closure Test', ended_at: '2026-09-01T16:15:50Z' },
    { id: 1194, title: 'Magnolia Reflection Timing', ended_at: '2026-09-01T17:00:00Z' },
    { id: 1201, title: 'Redwood Retrieval', ended_at: '2026-09-01T18:00:00Z' }
];

assert.strictEqual(
    extractTitleHint('In our chat about Magnolia Reflection Timing, what did we discuss?'),
    'magnolia reflection timing'
);
assert.strictEqual(
    looksLikeTitleReference('What did we decide in the Redwood Retrieval conversation?'),
    true
);
assert.strictEqual(
    looksLikeTitleReference('What did we discuss in that conversation?'),
    false
);
assert.strictEqual(
    looksLikeTitleReference('Can we continue our old chat?'),
    false
);
assert.deepStrictEqual(
    resolveSessionTitleReference(
        'In our chat about Magnolia Reflection Timing, what did we discuss?',
        sessions
    ).match,
    { sessionId: '1194', title: 'Magnolia Reflection Timing' }
);
assert.deepStrictEqual(
    resolveSessionTitleReference(
        'What did we decide in the Redwood Retrieval conversation?',
        sessions
    ).match,
    { sessionId: '1201', title: 'Redwood Retrieval' }
);
assert.strictEqual(
    resolveSessionTitleReference('In our chat about Missing Title, what did we discuss?', sessions).match,
    null
);

console.log('sessionTitleResolver.test.js: all assertions passed');
