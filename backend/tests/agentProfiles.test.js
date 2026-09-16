const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { atlasState } = require('../src/core/atlasState');
const { createAgentProfileStore } = require('../src/agents/agentProfiles');

async function main() {
    let clock = 0, failed = false, calls = [];
    const profiles = { alice: structuredClone(atlasState), bob: structuredClone(atlasState) };
    profiles.bob.identity.name = 'Bob';
    profiles.bob.preferences.enjoys = ['Go'];
    const client = { from(table) {
        assert.equal(table, 'agent_profiles');
        return { select: () => ({ eq: (field, id) => ({ maybeSingle: async () => {
            assert.equal(field, 'agent_id'); calls.push(id);
            return failed ? { error: { code: 'offline' } } : { data: profiles[id] ? {
                agent_id: id, schema_version: 1, revision: 3, profile: profiles[id]
            } : null };
        } }) }) };
    } };
    const store = createAgentProfileStore({ client, now: () => clock, ttlMs: 10 });
    const alice = await store.get('alice');
    assert.equal(alice.source, 'database');
    alice.profile.preferences.enjoys.length = 0;
    assert.deepEqual((await store.get('alice')).profile, atlasState);
    assert.equal(calls.length, 1);
    assert.equal((await store.get('bob')).profile.identity.name, 'Bob');
    assert.deepEqual((await store.get('bob')).profile.preferences.enjoys, ['Go']);
    clock = 11; failed = true;
    assert.equal((await store.get('bob')).source, 'cached_database');
    const fresh = createAgentProfileStore({ client });
    assert.equal((await fresh.get('alice')).source, 'seed_fallback');
    await assert.rejects(fresh.get('bob'), /refusing to substitute/);
    await assert.rejects(fresh.get('../alice'), /Invalid agent ID/);
    failed = false; clock = 22;
    profiles.bob = { identity: { name: 'Broken' } };
    await assert.rejects(store.get('bob'), /Invalid agent profile shape/);

    const db = new PGlite();
    try {
        await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
        const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/016_agent_profiles.sql'), 'utf8');
        await db.exec(sql);
        assert.deepEqual((await db.query("select profile from agent_profiles where agent_id='alice'")).rows[0].profile, atlasState);
        await db.query("update agent_profiles set profile=jsonb_set(profile, '{identity,name}', '\"Customized\"') where agent_id='alice'");
        await db.exec(sql);
        const row = (await db.query("select profile, revision from agent_profiles where agent_id='alice'")).rows[0];
        assert.equal(row.profile.identity.name, 'Customized');
        assert.equal(Number(row.revision), 2);
        await db.exec("insert into agents(agent_id,display_name) values ('bob','Bob');");
        await db.query('insert into agent_profiles(agent_id,profile) values ($1,$2)', ['bob', JSON.stringify(atlasState)]);
        assert.equal((await db.query('select count(*)::int as n from agent_profiles')).rows[0].n, 2);
        await db.exec('set role anon;');
        await assert.rejects(db.query('select * from agent_profiles'), /permission denied/);
    } finally { await db.close(); }
    console.log('Agent profile isolation, cache/fallback, validation, migration seed, revision and access checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
