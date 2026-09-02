const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { fastRegexNormalizer } = require('../src/planner/normalizer');

assert.strictEqual(
    fastRegexNormalizer('Does the current knowledge schema already include a last_verified_at field?').intent,
    'none'
);
assert.strictEqual(
    fastRegexNormalizer('Does this table include a verification status column?').intent,
    'none'
);
assert.strictEqual(
    fastRegexNormalizer('Append a line to the release notes saying provenance is required.').intent,
    'append_note'
);
assert.strictEqual(
    fastRegexNormalizer('Rename the note called old plan to new plan.').intent,
    'rename_note'
);
assert.strictEqual(
    fastRegexNormalizer('Delete the note called scratchpad.').intent,
    'delete_note'
);

console.log('plannerNormalizerGrounding.test.js: all assertions passed');
