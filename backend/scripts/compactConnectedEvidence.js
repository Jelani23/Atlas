const path = require('node:path');
const fs = require('node:fs/promises');
const { compactStore } = require('../src/reasoning/evidencePilot/compactStore');
(async () => {
    if (process.argv.length > 2) throw new Error('Usage: node backend/scripts/compactConnectedEvidence.js');
    const root = path.resolve(__dirname, '..');
    const result = await compactStore(root);
    const manifest = path.join(root, '.local/connected-evidence-test', `compaction-${Date.now()}.json`);
    await fs.writeFile(manifest, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: result.status, files: result.files.length, savedBytes: result.savedBytes, manifest }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
