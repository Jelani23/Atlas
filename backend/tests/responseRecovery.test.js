const assert = require('assert');
const {
    shouldRecoverResponse,
    getRecoveryAppend
} = require('../src/response/recovery');

assert.strictEqual(shouldRecoverResponse('', { doneReason: 'stop' }), true);
assert.strictEqual(shouldRecoverResponse('Partial answer', { doneReason: 'length' }), true);
assert.strictEqual(shouldRecoverResponse('Complete answer.', { doneReason: 'stop' }), false);
assert.strictEqual(
    getRecoveryAppend('The release is v0.3', 'The release is v0.33.2 and includes fixes.'),
    '3.2 and includes fixes.'
);
assert.strictEqual(
    getRecoveryAppend('The release is v0.3', '3.2 and includes fixes.'),
    '3.2 and includes fixes.'
);

console.log('responseRecovery.test.js: all assertions passed');
