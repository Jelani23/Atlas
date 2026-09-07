const assert = require('assert');

process.env.SUPABASE_URL = 'https://sandbox-placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sandbox-placeholder-key';

const { isKnowledgeActive } = require('../src/memory/knowledgeAudit');

assert.strictEqual(isKnowledgeActive({ verification_status: 'verified' }), true);
assert.strictEqual(isKnowledgeActive({ verification_status: 'unverified' }), true);
assert.strictEqual(isKnowledgeActive({ verification_status: 'contradicted' }), false);
assert.strictEqual(isKnowledgeActive({ verification_status: 'superseded', superseded_by: 2 }), false);
assert.strictEqual(isKnowledgeActive({ verification_status: 'verified', superseded_by: 2 }), false);

console.log('knowledgeActiveFiltering.test.js passed');
