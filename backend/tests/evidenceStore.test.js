const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { compactStore } = require('../src/reasoning/evidencePilot/compactStore');
const { readEvidenceSync } = require('../src/reasoning/evidencePilot/store');
(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-evidence-store-'));
    try {
        const dir = path.join(root, '.local/connected-evidence-test'); await fs.mkdir(dir, { recursive: true });
        const file = path.join(dir, `evidence-${'a'.repeat(64)}.json`);
        const content = { text: 'Source Ω preserves exact content.\n'.repeat(1000) };
        const bytes = Buffer.from(JSON.stringify(content)); await fs.writeFile(file, bytes);
        const result = await compactStore(root);
        assert.equal(result.files.length, 1);
        assert(result.savedBytes > 0);
        assert.deepEqual(zlib.gunzipSync(await fs.readFile(file + '.gz')), bytes);
        assert.deepEqual(readEvidenceSync(file), content); // Old archived references still resolve.
        assert.deepEqual(readEvidenceSync(file + '.gz'), content);
        assert.equal((await compactStore(root)).files.length, 0);
        await fs.writeFile(file, '{"different":true}');
        await assert.rejects(compactStore(root), /differs/);
        assert.equal(await fs.readFile(file, 'utf8'), '{"different":true}');
        assert.deepEqual(zlib.gunzipSync(await fs.readFile(file + '.gz')), bytes);
        assert(!(await fs.readdir(dir)).some(n => n.endsWith('.tmp')));
        console.log('Evidence compaction: byte-for-byte recovery, old references, idempotence and conflict preservation passed.');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
