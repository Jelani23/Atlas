// Offline replay of the preserved failing run. Never rebind its citations to a
// differently packed context, and never execute the inspected project sources.
const fs = require('node:fs');
const path = require('node:path');
const { readEvidenceSync } = require('../src/reasoning/evidencePilot/store');
const { extractOperations } = require('../src/reasoning/evidencePilot/operations');
const { reviewClaims } = require('../src/reasoning/evidencePilot/claimReview');
const { buildContext } = require('../src/reasoning/evidencePilot/context');
const root = path.resolve(__dirname, '../.local/connected-evidence-test');
const archive = path.join(root, 'all-summary-review-2026-10-11');
const records = fs.readdirSync(archive).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(n => JSON.parse(fs.readFileSync(path.join(archive, n))));
const graphs = new Map();
const rows = records.map(record => {
    if (!graphs.has(record.evidenceFile)) graphs.set(record.evidenceFile, readEvidenceSync(path.join(root, record.evidenceFile)));
    const graph = graphs.get(record.evidenceFile), target = record.packet.target;
    const file = graph.snapshot.files[target];
    const operations = extractOperations(target, file.source, file.hash);
    const review = reviewClaims(record.summary.claims, { ...record.packet, operations });
    const newPacket = buildContext(graph, target, record.packet.selection);
    return { target, snapshotVersion: record.snapshotVersion, originalPacketFingerprint: record.packet.fingerprint,
        policy: 'Original claims and original citation IDs preserved. New operation evidence is extracted from the same frozen snapshot. Remaining claims are NOT verified.',
        claims: review, observedOperations: operations,
        newContext: { chars: JSON.stringify(newPacket).length, operations: newPacket.operations, omitted: newPacket.omitted } };
});
const output = path.join(root, 'conditional-claim-review.json');
fs.writeFileSync(output, JSON.stringify({ mode: 'offline_saved_answer_review', rows }, null, 2));
console.log(JSON.stringify({ output, rows: rows.map(r => ({ target: r.target, withheld: r.claims.filter(c => c.review.status === 'withheld').length,
    retainedUnverified: r.claims.filter(c => c.review.status === 'unverified').length, packetChars: r.newContext.chars })) }, null, 2));
