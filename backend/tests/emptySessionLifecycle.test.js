const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const {
    getSessionCloseOutcome,
    getSessionResumeUpdate,
    REFLECTION_MIN_MESSAGES
} = require('../src/memory/sessionManager');

assert.deepStrictEqual(
    getSessionCloseOutcome(0, true),
    { deleted: true, reflectionStatus: 'deleted' }
);
assert.deepStrictEqual(
    getSessionCloseOutcome(1, true),
    { deleted: false, reflectionStatus: 'skipped' }
);
assert.deepStrictEqual(
    getSessionCloseOutcome(REFLECTION_MIN_MESSAGES, true),
    { deleted: false, reflectionStatus: 'pending' }
);
assert.deepStrictEqual(
    getSessionCloseOutcome(2, false),
    { deleted: false, reflectionStatus: null }
);
assert.deepStrictEqual(
    getSessionResumeUpdate(true),
    {
        ended_at: null,
        reflection_status: 'open',
        reflection_attempts: 0,
        reflection_error: null,
        reflection_started_at: null,
        reflected_at: null
    }
);
assert.deepStrictEqual(getSessionResumeUpdate(false), { ended_at: null });

console.log('emptySessionLifecycle.test.js: all assertions passed');
