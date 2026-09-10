// Structural checks only; run tests/sql/knowledgeIngestion.sql for PostgreSQL execution.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/011_knowledge_ingestion_review.sql'), 'utf8').trim();
const schema = fs.readFileSync(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8');
assert.ok(schema.includes(migration), 'Fresh schema and migration must stay synchronized');
assert.match(migration, /on conflict \(category, subject, key\) do nothing/i);
assert.match(migration, /for update/i);
assert.match(migration, /current_row\.updated_at is distinct from/);
assert.match(migration, /current_row\.verification_attempts is distinct from/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /security invoker/i);
assert.match(migration, /revoke all on function/);
assert.doesNotMatch(migration, /delete from public\.knowledge_library/i);
console.log('knowledgeIngestionMigration.test.js passed (structural checks, not SQL execution)');
