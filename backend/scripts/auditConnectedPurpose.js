// Replay preserved model answers without changing their citation/operation IDs.
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../src/reasoning/evidencePilot/outline');
const root = path.resolve(__dirname, '../.local/connected-evidence-test');
const archive = path.join(root, 'outline-live-2026-10-13');
const rows = fs.readdirSync(archive).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(name => {
    const record = JSON.parse(fs.readFileSync(path.join(archive, name)));
    const interpretation = validate(record.audit.text, record.packet);
    return { target: record.packet.target, snapshotVersion: record.snapshotVersion,
        originalPacketFingerprint: record.packet.fingerprint, interpretation };
});
const file = path.join(root, 'purpose-boundary-replay.json');
fs.writeFileSync(file, JSON.stringify({ mode: 'offline_saved_answer_replay', modelRerun: false,
    limitation: 'Only the outline release rules are reapplied. Original source, citations and selected operations are unchanged. Remaining purpose prose is not verified.', rows }, null, 2));
console.log(JSON.stringify({ file, rows: rows.map(r => ({ target: r.target, retained: r.interpretation.claims.length,
    withheld: r.interpretation.withheldClaims.length, operations: r.interpretation.selectedOperations.length })) }, null, 2));
