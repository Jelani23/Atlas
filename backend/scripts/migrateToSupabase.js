// One-time migration: copies everything out of the old atlas.db (better-sqlite3)
// and the JSON files under src/memory/*.json, and pushes it into Supabase.
//
// Usage:
//   1. Run src/database/supabase_schema.sql in the Supabase SQL editor first.
//   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
//   3. npm install better-sqlite3 (it's a devDependency now, only needed for
//      this one-time migration - the app itself no longer uses it).
//   4. node scripts/migrateToSupabase.js
//
// Safe to re-run: everything here is either an upsert on a unique key, or
// explicitly skips rows that already exist by matching on old ids/content.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const supabase = require('../src/database/supabaseClient');

const ROOT = path.join(__dirname, '..');
const SQLITE_PATH = path.join(ROOT, 'atlas.db');
const MEMORY_DIR = path.join(ROOT, 'src', 'memory');

function loadJSON(filename) {
    const filePath = path.join(MEMORY_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.warn(`  ! Couldn't parse ${filename}, skipping:`, e.message);
        return [];
    }
}

async function migrateSessionsAndConversations(sqliteDb) {
    console.log('\n[1/8] Migrating sessions + conversations...');

    const sessions = sqliteDb.prepare('SELECT id, started_at, ended_at FROM sessions').all();
    if (sessions.length === 0) {
        console.log('  No sessions found, skipping.');
        return {};
    }

    // Old SQLite session ids won't match the new Postgres identity ids, so we
    // keep a map of old_id -> new_id to rewrite conversations.session_id below.
    const idMap = {};

    for (const s of sessions) {
        const { data, error } = await supabase
            .from('sessions')
            .insert({
                started_at: s.started_at,
                ended_at: s.ended_at
            })
            .select('id')
            .single();

        if (error) {
            console.error(`  ! Failed to migrate session ${s.id}:`, error.message);
            continue;
        }
        idMap[s.id] = data.id;
    }
    console.log(`  Migrated ${Object.keys(idMap).length}/${sessions.length} sessions.`);

    const conversations = sqliteDb.prepare('SELECT session_id, role, content, timestamp FROM conversations ORDER BY id ASC').all();
    console.log(`  Migrating ${conversations.length} conversation messages...`);

    // Batch in chunks so we don't send one giant request.
    const BATCH_SIZE = 500;
    let migrated = 0;
    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
        const batch = conversations.slice(i, i + BATCH_SIZE)
            .filter(c => idMap[c.session_id]) // drop rows whose session failed to migrate
            .map(c => ({
                session_id: idMap[c.session_id],
                role: c.role,
                content: c.content,
                timestamp: c.timestamp
            }));

        if (batch.length === 0) continue;

        const { error } = await supabase.from('conversations').insert(batch);
        if (error) {
            console.error(`  ! Failed batch starting at row ${i}:`, error.message);
            continue;
        }
        migrated += batch.length;
    }
    console.log(`  Migrated ${migrated}/${conversations.length} conversation messages.`);

    return idMap;
}

async function migrateUserProfile(sqliteDb) {
    console.log('\n[2/8] Migrating user_profile...');
    const rows = sqliteDb.prepare('SELECT category, key, value, confidence FROM user_profile').all();

    if (rows.length === 0) {
        console.log('  No profile rows found, skipping.');
        return;
    }

    // upsert on (category, key) - if the same fact appears twice in the old
    // db (shouldn't, but just in case), the later row wins.
    const { error } = await supabase
        .from('user_profile')
        .upsert(rows, { onConflict: 'category,key' });

    if (error) {
        console.error('  ! Failed to migrate user_profile:', error.message);
        return;
    }
    console.log(`  Migrated ${rows.length} profile entries.`);
}

async function migrateProjectMemory() {
    console.log('\n[3/8] Migrating projectMemory.json...');
    const rows = loadJSON('projectMemory.json');
    if (rows.length === 0) {
        console.log('  Nothing to migrate.');
        return;
    }

    const payload = rows.map(r => ({
        subject: r.subject || 'general',
        key: r.key,
        value: r.value,
        created_at: r.createdAt || new Date().toISOString()
    }));

    const { error } = await supabase.from('project_memory').insert(payload);
    if (error) {
        console.error('  ! Failed to migrate project memory:', error.message);
        return;
    }
    console.log(`  Migrated ${payload.length} project memory entries.`);
}

async function migrateKnowledgeLibrary() {
    console.log('\n[4/8] Migrating knowledgeLibrary.json...');
    const rows = loadJSON('knowledgeLibrary.json');
    if (rows.length === 0) {
        console.log('  Nothing to migrate.');
        return;
    }

    const payload = rows.map(r => ({
        subject: r.subject || 'general',
        key: r.key,
        value: r.value,
        updated_at: r.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase.from('knowledge_library').upsert(payload, { onConflict: 'subject,key' });
    if (error) {
        console.error('  ! Failed to migrate knowledge library:', error.message);
        return;
    }
    console.log(`  Migrated ${payload.length} knowledge entries.`);
}

async function migrateProceduralMemory() {
    console.log('\n[5/8] Migrating proceduralMemory.json...');
    const rows = loadJSON('proceduralMemory.json');
    if (rows.length === 0) {
        console.log('  Nothing to migrate.');
        return;
    }

    const payload = rows.map(r => ({
        trigger: r.trigger,
        action: r.action,
        context: r.context || 'general',
        updated_at: r.updatedAt || new Date().toISOString()
    }));

    const { error } = await supabase.from('procedural_memory').insert(payload);
    if (error) {
        console.error('  ! Failed to migrate procedural memory:', error.message);
        return;
    }
    console.log(`  Migrated ${payload.length} procedures.`);
}

async function migrateDevState() {
    console.log('\n[6/8] Migrating devState.json...');
    const rows = loadJSON('devState.json');
    if (rows.length === 0) {
        console.log('  Nothing to migrate.');
        return;
    }

    const payload = rows.map(r => ({
        feature: r.feature,
        status: r.status,
        updated_at: r.updated_at || new Date().toISOString()
    }));

    const { error } = await supabase.from('dev_state').insert(payload);
    if (error) {
        console.error('  ! Failed to migrate dev state:', error.message);
        return;
    }
    console.log(`  Migrated ${payload.length} dev state entries.`);
}

async function migrateReflections(sessionIdMap) {
    console.log('\n[7/8] Migrating reflections.json...');
    const rows = loadJSON('reflections.json');
    if (rows.length === 0) {
        console.log('  Nothing to migrate.');
        return;
    }

    const payload = rows.map(r => ({
        session_id: sessionIdMap[r.sessionId] || null,
        summary: r.summary,
        timestamp: r.timestamp || new Date().toISOString()
    }));

    const { error } = await supabase.from('reflections').insert(payload);
    if (error) {
        console.error('  ! Failed to migrate reflections:', error.message);
        return;
    }
    console.log(`  Migrated ${payload.length} reflections.`);
}

async function migrateWorldModel() {
    console.log('\n[8/8] Migrating worldModel.json...');
    const worldModelPath = path.join(MEMORY_DIR, 'worldModel.json');
    if (!fs.existsSync(worldModelPath)) {
        console.log('  No worldModel.json found, skipping.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(worldModelPath, 'utf8'));

    const { error } = await supabase
        .from('world_model')
        .upsert({ id: 1, data, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) {
        console.error('  ! Failed to migrate world model:', error.message);
        return;
    }
    console.log('  Migrated world model config.');
}

async function main() {
    if (!fs.existsSync(SQLITE_PATH)) {
        console.error(`Couldn't find atlas.db at ${SQLITE_PATH}. Nothing to migrate from SQLite - JSON files will still be migrated.`);
    }

    console.log('Starting Atlas -> Supabase migration...');

    let sessionIdMap = {};
    if (fs.existsSync(SQLITE_PATH)) {
        const sqliteDb = new Database(SQLITE_PATH, { readonly: true });
        sessionIdMap = await migrateSessionsAndConversations(sqliteDb);
        await migrateUserProfile(sqliteDb);
        sqliteDb.close();
    }

    await migrateProjectMemory();
    await migrateKnowledgeLibrary();
    await migrateProceduralMemory();
    await migrateDevState();
    await migrateReflections(sessionIdMap);
    await migrateWorldModel();

    console.log('\nDone. Spot-check a few tables in the Supabase dashboard, then you can');
    console.log('archive atlas.db and the src/memory/*.json files - Atlas no longer reads them.');
}

main().catch(err => {
    console.error('\nMigration failed:', err);
    process.exit(1);
});
