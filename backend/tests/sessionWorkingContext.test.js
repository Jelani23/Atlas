const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const clientPath = require.resolve('../src/database/supabaseClient');
let reply, call;
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: {
    rpc: async (name, args) => { call = { name, args }; return reply; }
} };
const { mergeWorkingContext } = require('../src/memory/sessionManager');
async function main() {
    reply = { data: { current_topic: 'memory' } };
    assert.deepEqual(await mergeWorkingContext(1276, { current_topic: 'memory' }), reply.data);
    assert.equal(call.name, 'merge_session_working_context_v2');
    assert.equal(call.args.p_session_id, 1276);
    await assert.rejects(mergeWorkingContext('not-a-numeric-id', { current_topic: 'memory' }), /numeric session id/);
    await assert.rejects(mergeWorkingContext(1276, []), /object delta/);
    reply = { data: null };
    await assert.rejects(mergeWorkingContext(1276, { current_topic: 'memory' }), /no object confirmation/);
    reply = { error: { code: 'PGRST202', message: 'RPC not found' } };
    await assert.rejects(mergeWorkingContext(1276, { current_topic: 'memory' }), /migration 014/);
    reply = { error: { code: '22P02', message: 'Invalid ID' } };
    await assert.rejects(mergeWorkingContext(1276, { current_topic: 'memory' }), /Invalid ID/);
    const schema = fs.readFileSync(path.join(__dirname, '../src/database/supabase_schema.sql'), 'utf8');
    const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/014_session_working_context.sql'), 'utf8').trim();
    assert.ok(schema.includes(migration));
    for (const mode of ['fresh', 'upgrade']) {
        const db = new PGlite();
        try {
            await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
            await db.exec(mode === 'fresh' ? schema : schema.slice(0, schema.indexOf(migration)));
            if (mode === 'upgrade') {
                // Reproduce a deployment with the legacy UUID endpoint present.
                await db.exec("create function public.merge_session_working_context(p_session_id uuid, p_delta jsonb) returns jsonb language sql as 'select p_delta';");
                await db.exec(migration);
            }
            await db.exec(migration);
            await db.exec(fs.readFileSync(path.join(__dirname, 'sql/sessionWorkingContext.sql'), 'utf8'));
            assert.equal((await db.query('select count(*)::integer as n from sessions')).rows[0].n, 0);
        } finally { await db.close(); }
    }
    console.log('sessionWorkingContext.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
