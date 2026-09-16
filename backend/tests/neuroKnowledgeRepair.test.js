const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { resolveKnowledgeOverviewReply } = (() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    return require('../src/memory/knowledgeAnswerBoundary');
})();
const sql = fs.readFileSync(path.join(__dirname, '../../docs/sql/repair-neuro-knowledge-2026-09-14.sql'), 'utf8');
const previous = [
    [60, 'creator', 'Vedal, a pseudonymous British programmer'],
    [61, 'evil_neuro_characteristics', "Evil Neuro is presented as Neuro-sama's twin sister with a distinct model, voice, and amoral personality"],
    [62, 'streaming_platform', 'Neuro-sama streams primarily on Twitch under the channel vedal987']
];
async function main() {
    const db = new PGlite();
    await db.exec(`CREATE TABLE knowledge_library (
        id bigint PRIMARY KEY, category text, subject text, key text, value text,
        type text, source text, source_type text, confidence double precision,
        updated_at timestamptz, topics text[]
    );`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../src/database/migrations/007_knowledge_verification.sql'), 'utf8'));
    for (const [id, key, value] of previous) await db.query(`INSERT INTO knowledge_library
        (id,category,subject,key,value,type,source,source_type,updated_at,verification_status)
        VALUES ($1,'technology','neuro_sama',$2,$3,'fact',
        'web_search: Can you look up information on Neuro-sama?','web_search',
        '2026-09-02T13:40:31.980626+00:00','needs_source')`, [id,key,value]);
    await db.exec("INSERT INTO knowledge_library(id,value) VALUES (99,'unrelated');");
    // A late snapshot mismatch must undo even the preceding row updates/audits.
    await db.exec("UPDATE knowledge_library SET value='newer information' WHERE id=62;");
    await assert.rejects(db.exec(sql), /changed since inspection/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query('SELECT count(*) AS n FROM knowledge_verification_runs')).rows[0].n, 0);
    assert.equal((await db.query('SELECT verification_status FROM knowledge_library WHERE id=60')).rows[0].verification_status, 'needs_source');
    await db.query('UPDATE knowledge_library SET value=$1 WHERE id=62', [previous[2][2]]);
    await db.exec(sql);
    const rows = (await db.query('SELECT * FROM knowledge_library WHERE id IN (60,61,62)')).rows;
    assert(rows.every(row => row.verification_status === 'verified' && row.verification_method === 'manual'));
    assert.equal((await db.query('SELECT count(*) AS n FROM knowledge_verification_runs')).rows[0].n, 3);
    assert.equal((await db.query('SELECT value FROM knowledge_library WHERE id=99')).rows[0].value, 'unrelated');
    const reply = resolveKnowledgeOverviewReply('What do you know about Neuro-sama?', { knowledge: rows });
    assert.match(reply, /AI VTuber created by Vedal/);
    assert.match(reply, /twin sister/);
    assert.match(reply, /Twitch channel vedal987/);
    assert(!/British|amoral|distinct model/.test(reply));
    await assert.rejects(db.exec(sql), /changed since inspection/);
    await db.exec('ROLLBACK;');
    await db.close();
    console.log('neuroKnowledgeRepair.test.js passed (embedded PostgreSQL, no live DB)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
