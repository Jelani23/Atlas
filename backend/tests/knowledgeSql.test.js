// Real PostgreSQL/PLpgSQL in isolated WASM databases. Never reads .env or Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
async function run() {
    const schema = fs.readFileSync(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8');
    const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/013_knowledge_maintenance.sql'), 'utf8').trim();
    assert.ok(schema.includes(migration), 'Fresh schema must include the migration');
    for (const mode of ['fresh', 'upgrade']) {
        const db = new PGlite();
        try {
            await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
            await db.exec(mode === 'fresh' ? schema : schema.slice(0, schema.indexOf(migration)));
            if (mode === 'upgrade') await db.exec(migration);
            await db.exec(migration); // Reapplication must be harmless.
            for (const file of ['knowledgeIngestion.sql', 'knowledgeReviewResolution.sql', 'knowledgeMaintenance.sql']) {
                await db.exec(fs.readFileSync(path.join(__dirname, 'sql', file), 'utf8'));
                const rows = await db.query('select count(*)::integer as count from knowledge_library');
                assert.equal(rows.rows[0].count, 0, 'SQL assertions must roll back synthetic rows');
                console.log(`${mode}: ${file} passed`);
            }
        } finally { await db.close(); }
    }
}
run().catch(error => { console.error(error.message, error.where || ''); process.exitCode = 1; });
