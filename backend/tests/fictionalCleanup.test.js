// Execute the optional manual cleanup only against disposable local PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
async function main() {
    const db = new PGlite();
    try {
        await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
        await db.exec(fs.readFileSync(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8'));
        // The deployed project store includes this column; the base-schema
        // project section predates it. Only this isolated fixture is augmented.
        await db.exec('alter table project_memory add column if not exists project_key text;');
        const cleanup = fs.readFileSync(path.join(__dirname, '../scripts/removeFictionalLiveTestRows.sql'), 'utf8');
        async function seed() {
            await db.exec(`truncate knowledge_verification_runs, knowledge_library, project_memory restart identity cascade;
                insert into project_memory(id, project_key, subject, key, value) overriding system value
                values (96, 'atlas', 'general', 'cedar_demo_service_database', 'The cedar_demo_service stores its data in a SQLite database.');
                insert into knowledge_library(id, category, subject, key, value, verification_status) overriding system value values
                (88, 'technology', 'sqlite', 'database_engine', 'The birch_demo_service uses SQLite as its database engine.', 'needs_source'),
                (89, 'technology', 'postgresql', 'database_engine', 'The birch_demo_service now uses PostgreSQL as its database engine, replacing SQLite.', 'needs_source'),
                (90, 'technology', 'sqlite', 'database_type', 'SQLite is an in-process database library.', 'needs_source'),
                (91, 'technology', 'sqlite', 'database_library', 'SQLite runs within its host application process.', 'needs_source'),
                (92, 'technology', 'postgresql', 'architecture', 'PostgreSQL uses a client/server architecture.', 'needs_source');`);
        }
        async function snapshot() {
            return (await db.query("select * from (select 'knowledge' as store, to_jsonb(k) as row from knowledge_library k union all select 'project', to_jsonb(p) from project_memory p) records order by store, row->>'id'")).rows;
        }
        await seed();
        const realBefore = (await snapshot()).filter(item => Number(item.row.id) >= 90 && item.store === 'knowledge');
        await db.exec(cleanup);
        assert.deepEqual(await snapshot(), realBefore, 'Only the three fictional rows may be removed');
        for (const change of [
            'delete from knowledge_library where id = 89',
            "update knowledge_library set verification_status = 'verified' where id = 89",
            "insert into knowledge_verification_runs(knowledge_id, query) values (88, 'Linked fixture')"
        ]) {
            await seed();
            await db.exec(change);
            const before = await snapshot();
            await assert.rejects(db.exec(cleanup), /missing or changed|linked lifecycle/);
            await db.exec('rollback');
            assert.deepEqual(await snapshot(), before, 'A rejected cleanup must roll back earlier deletes');
        }
        console.log('fictionalCleanup.test.js passed');
    } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
