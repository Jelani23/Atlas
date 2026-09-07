const assert = require('assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { resolve } = require('../src/intent/intentResolver');
const { extractRecordIds } = require('../src/tools/memory/reverifyKnowledge');

const route = resolve('Reverify knowledge record 64.');
assert.strictEqual(route.state, 'DETERMINISTIC');
assert.strictEqual(route.winner, 'reverifyKnowledge');
assert.deepStrictEqual(route.params, [64]);

const rangeRoute = resolve('Reverify knowledge record 77-79.');
assert.strictEqual(rangeRoute.state, 'DETERMINISTIC');
assert.strictEqual(rangeRoute.winner, 'reverifyKnowledge');
assert.deepStrictEqual(rangeRoute.params, [77, 78, 79]);
assert.deepStrictEqual(extractRecordIds('Reverify knowledge records 77, 79 and 81.'), [77, 79, 81]);
assert.deepStrictEqual(extractRecordIds('Reverify knowledge records 79 through 77.'), [79, 78, 77]);

const pluralRoute = resolve('Reverify knowledge records 74, 75, 76, and 65.');
assert.strictEqual(pluralRoute.winner, 'reverifyKnowledge');
assert.deepStrictEqual(pluralRoute.params, [74, 75, 76, 65]);

const pluralRangeRoute = resolve('Reverify knowledge records 74-76.');
assert.strictEqual(pluralRangeRoute.winner, 'reverifyKnowledge');
assert.deepStrictEqual(pluralRangeRoute.params, [74, 75, 76]);

const shortRoute = resolve('Reverify record 63.');
assert.strictEqual(shortRoute.winner, 'reverifyKnowledge');
assert.deepStrictEqual(shortRoute.params, [63]);

const schemaQuestion = resolve('Does knowledge record 64 have a verification status?');
assert.notStrictEqual(schemaQuestion.winner, 'reverifyKnowledge');

console.log('knowledgeVerificationRouting.test.js: all assertions passed');
