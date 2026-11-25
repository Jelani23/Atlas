// Read-only freshness inspection: no model call, compiler rebuild or store write.
const path = require('node:path');
const { EvidencePilot } = require('../src/reasoning/evidencePilot/runner');
async function main() {
    if (process.argv.length > 2) throw new Error('Usage: node backend/scripts/reviewConnectedEvidence.js');
    const pilot = new EvidencePilot({ root: path.resolve(__dirname, '..') });
    try {
        const graph = await pilot.store.read('graph.json');
        const targets = Object.keys(graph?.packets || {});
        if (!targets.length) { console.log(JSON.stringify({ status: 'unavailable', reason: 'No pilot packets available.' }, null, 2)); return; }
        const result = await pilot.readCurrentRecords(targets);
        console.log(JSON.stringify({ status: result.status, snapshotVersion: result.snapshotVersion, reason: result.reason,
            limitation: result.limitation, targets: result.records.map(({ target, record }) => ({ target, status: record.status,
                contract: record.summary?.contract || null, selectedOperations: record.summary?.selectedOperations?.length || 0,
                withheldClaims: record.summary?.withheldClaims?.length || 0, modelFailure: record.audit?.error || null })) }, null, 2));
    } finally { await pilot.stop(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
