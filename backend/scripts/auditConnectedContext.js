// Offline replay against the preserved first live run. Never calls a model or executes source.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildContext, inspectCitations } = require('../src/reasoning/evidencePilot/context');
const { hash } = require('../src/reasoning/evidencePilot/collector');
const directory = path.resolve(__dirname, '../.local/connected-evidence-test');
const archive = path.join(directory, 'live-review-2026-10-11');
const names = fs.readdirSync(archive).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
const records = names.map(name => JSON.parse(fs.readFileSync(path.join(archive, name), 'utf8')));
const graph = require('../src/reasoning/evidencePilot/store').readEvidenceSync(path.join(directory, records[0].evidenceFile));
const rows = records.map(record => {
    const packet = buildContext(graph, record.packet.target, record.packet.selection);
    assert(JSON.stringify(packet).length <= 24000);
    const excerpts = packet.evidence.filter(e => e.kind === 'excerpt' && e.path === packet.target);
    if (packet.target === 'src/core/conversationEngine.js') {
        const handle = excerpts.find(e => e.label === 'handleMessage');
        assert(handle?.text.includes('if (previous.deep) taskManager.cancelTask(previous.taskId)'));
        assert(handle.text.includes('await previous.promise.catch'));
        const branch = excerpts.find(e => e.label === 'if (question)');
        assert(branch?.text.includes('catch(error)'));
        assert(branch.text.includes("return {reply:'',audio:null}"));
    } else {
        assert(excerpts.some(e => !e.partialFile && e.text === graph.snapshot.files[packet.target].source));
    }
    // Citation review uses OLD IDs and OLD text; never rebind a saved answer to a changed packet.
    const citationReview = record.summary ? inspectCitations(record.summary, record.packet) : null;
    const testExcerpts = packet.evidence.filter(e => e.class === 'TEST_SOURCE_NOT_EXECUTED');
    assert(testExcerpts.length);
    fs.writeFileSync(path.join(archive, path.basename(packet.target) + '.coherent-context.json'), JSON.stringify(packet, null, 2));
    return { target: packet.target, chars: JSON.stringify(packet).length,
        targetSourceCharacters: excerpts.reduce((sum, e) => sum + e.text.length, 0),
        completeTarget: excerpts.some(e => !e.partialFile),
        testSourceCharacters: testExcerpts.reduce((sum, e) => sum + e.text.length, 0),
        oldClaimCitationReview: citationReview, modelAccuracy: 'not_evaluated_for_new_packet' };
});
const report = { status: 'offline_passed', originalSnapshot: graph.snapshot.version,
    implementationHashes: Object.fromEntries(['context.js', 'sourceUnits.js'].map(name => [name, hash(fs.readFileSync(path.resolve(__dirname, '../src/reasoning/evidencePilot', name)))])), rows };
fs.writeFileSync(path.join(archive, 'coherent-context-review.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
