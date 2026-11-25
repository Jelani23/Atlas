const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { snapshot, collect } = require('../src/reasoning/evidencePilot/collector');
const { buildContext, validate } = require('../src/reasoning/evidencePilot/context');
const { EvidencePilot, scan } = require('../src/reasoning/evidencePilot/runner');
const Events = require('../src/events/eventTypes');

(async () => {
    const { generationProfile } = require('../src/reasoning/evidencePilot/generation');
    const reasoning = generationProfile(), summary = generationProfile('summary');
    assert.equal(reasoning.generation.think, true);
    assert.equal(summary.generation.think, false);
    assert.equal(summary.generation.model, 'qwen3.5:4b');
    assert.notEqual(reasoning.summaryKey, summary.summaryKey);
    assert.equal(summary.summaryKey, generationProfile('summary').summaryKey);
    assert.throws(() => generationProfile('unknown'));
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-connected-'));
    const root = path.join(temp, 'backend');
    const write = async (name, text) => { const full = path.resolve(root, name); await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, text); };
    // This code is only parsed. A side effect sentinel must never appear.
    await write('src/a.ts', 'import { twice } from "./b"; export function run(n: number) { return twice(n); }\nrequire(name);\nbus.emit(Events.STOP);\n');
    await write('src/b.ts', 'export function twice(n: number): number { return n * 2; }\nthrow new Error("ANALYZED_SOURCE_MUST_NOT_RUN");');
    await write('tests/a.test.js', 'const a = require("../src/a"); // intended run(2) === 4; not executed\n');
    await write('../docs/a.md', 'src/a.ts delegates to its helper.');
    await write('src/unrelated.ts', 'export const sameName = 1;');
    await write('src/common.js', 'const { twice } = require("./b"); module.exports = { twice };');
    await write('src/data.json', '{"source":"fixture"}');
    await write('src/json.js', 'module.exports = require("./data.json");');
    await write('src/shadow.js', 'function load(require) { return require("./b"); } module.exports = load;');
    await write('src/defaults.js', 'function load({ helper = require("./b") } = {}) { return helper; } module.exports = load;');
    await write('src/folder/index.js', 'module.exports = 1;');
    await write('src/folder/use.js', 'module.exports = require("./");');
    await write('src/keys.ts', 'export const Events = { STOP: "stop" };');
    await write('src/producer.ts', 'import { Events } from "./keys"; bus.emit(Events.STOP);');
    await write('src/listener.ts', 'import { Events } from "./keys"; otherBus.on(Events.STOP, () => {});');
    const fastScan = async (base, previous, _signal, options = {}) => { const s = snapshot(base); return s.version === previous ? { unchanged: true } : { graph: { ...collect(s), contextKey: options.contextKey } }; };
    const events = new EventEmitter();
    const pilot = new EvidencePilot({ root, events, collect: fastScan });
    try {
        const graph = collect(snapshot(root));
        assert(graph.links.some(e => e.from === 'src/a.ts' && e.to === 'src/b.ts' && e.kind === 'module'));
        assert(graph.links.some(e => e.from === 'src/common.js' && e.to === 'src/b.ts' && e.kind === 'module'));
        assert(graph.links.some(e => e.from === 'src/json.js' && e.to === 'src/data.json' && e.kind === 'module'));
        assert(!graph.links.some(e => e.from === 'src/shadow.js' && e.kind === 'module'));
        assert(graph.links.some(e => e.from === 'src/defaults.js' && e.to === 'src/b.ts' && e.kind === 'module'));
        assert(graph.links.some(e => e.from === 'src/folder/use.js' && e.to === 'src/folder/index.js' && e.kind === 'module'));
        assert(graph.links.some(e => e.from === 'src/producer.ts' && e.to === 'src/listener.ts' && e.status === 'unverified_connection'));
        assert(graph.records['src/a.ts'].relationships.some(r => r.kind === 'call' && r.target?.path === 'src/b.ts'));
        assert(graph.records['src/b.ts'].symbols.some(s => s.name === 'twice' && s.inferredType.includes('number')));
        assert(graph.records['src/a.ts'].relationships.some(r => r.kind === 'module' && r.reason === 'dynamic specifier'));
        assert(graph.records['src/a.ts'].relationships.some(r => r.kind === 'event_site' && r.status === 'syntax_candidate'));
        assert(graph.records['src/a.ts'].diagnostics.length > 0);
        const packet = buildContext(graph, 'src/a.ts', { maxChars: 8000 });
        const constrained = generationProfile('summary', packet);
        assert.equal(constrained.summaryKey, summary.summaryKey);
        assert.deepEqual(constrained.generation.format.properties.claims.items.properties.evidenceIds.items.enum,
            packet.evidence.filter(e => e.kind === 'excerpt').map(e => e.id));
        assert.throws(() => generationProfile('summary', { evidence: [] }), /No source excerpts/);
        const fnPacket = buildContext(graph, 'src/a.ts', { targetSymbol: 'run', maxChars: 5000 });
        assert.equal(fnPacket.scope.kind, 'function');
        assert(fnPacket.evidence[0].text.includes('return twice(n)'));
        assert(fnPacket.evidence.some(e => e.path === 'src/b.ts' && e.text.includes('n * 2')));
        assert(!fnPacket.evidence.some(e => e.path === 'src/unrelated.ts'));
        assert(JSON.stringify(fnPacket).length <= 5000);
        assert.throws(() => buildContext(graph, 'src/a.ts', { targetSymbol: 'missing' }), /unique function/);
        const duplicated = structuredClone(graph);
        duplicated.records['src/a.ts'].symbols.push(duplicated.records['src/a.ts'].symbols.find(s => s.name === 'run'));
        assert.throws(() => buildContext(duplicated, 'src/a.ts', { targetSymbol: 'run' }), /unique function/);
        assert(JSON.stringify(packet).length <= 8000);
        assert(packet.evidence.some(e => e.class === 'TEST_SOURCE_NOT_EXECUTED'));
        assert(packet.evidence.some(e => e.class === 'DOCUMENTATION_CLAIM'));
        assert(!packet.evidence.some(e => e.path === 'src/unrelated.ts'));
        assert(packet.evidence.some(e => e.path === 'src/a.ts' && e.kind === 'excerpt' && e.partialFile === false && e.text === graph.snapshot.files['src/a.ts'].source));
        const eventPacket = buildContext(graph, 'src/producer.ts');
        assert(!eventPacket.evidence.some(e => e.path === 'src/listener.ts'));
        assert.throws(() => validate('{"claims":[{"text":"x","evidenceIds":["invented"]}],"unknowns":[]}', packet));
        assert.throws(() => validate(JSON.stringify({ claims: [{ text: 'Unverified statement.', evidenceIds: ['e0'] }], unknowns: [] }), packet), /must cite supplied source text/);
        // Source anchoring does NOT prove this intentionally false interpretation.
        assert.equal(validate(JSON.stringify({ claims: [{ text: 'This code proves the moon is cheese.', evidenceIds: ['e1'] }], unknowns: [] }), packet).status, 'MODEL_INTERPRETATION_UNVERIFIED');
        assert.equal((await pilot.runOnce(['src/a.ts', 'src/a.ts'])).outcomes.length, 1);
        assert.equal((await pilot.runOnce(['src/a.ts'])).outcomes[0].status, 'cached');
        assert(await pilot.recall('src/a.ts'));
        assert.equal((await pilot.readCurrentRecords(['src/a.ts'])).status, 'current');
        const completedMarker = await pilot.store.read('current.json');
        await pilot.store.write('current.json', { ...completedMarker, state: 'refreshing' });
        assert.equal((await pilot.readCurrentRecords(['src/a.ts'])).status, 'incomplete');
        assert.equal(await pilot.recall('src/a.ts'), null);
        await pilot.store.write('current.json', completedMarker);
        await write('src/b.ts', 'export function twice(n: number): number { return n * 3; }');
        assert.equal((await pilot.readCurrentRecords(['src/a.ts'])).status, 'stale');
        assert.equal(await pilot.recall('src/a.ts'), null);
        assert.equal((await pilot.runOnce(['src/a.ts'])).outcomes[0].status, 'evidence_only');
        await fs.unlink(path.join(root, 'src/b.ts'));
        assert.equal(await pilot.recall('src/a.ts'), null);
        await pilot.runOnce(['src/a.ts', 'src/b.ts']);
        assert.equal((await pilot.recall('src/b.ts')).status, 'deleted_or_outside_scope');
        assert((await pilot.recall('src/a.ts')).packet.evidence.some(e => e.kind === 'module' && e.specifier === './b' && e.status === 'unresolved'));
        await write('src/b.ts', 'export function twice(n: number) { return n; }');
        assert.equal(await pilot.recall('src/a.ts'), null); // Previously missing dependency now exists.
        await pilot.runOnce(['src/a.ts']);
        await write('../docs/a.md', 'src/a.ts changed documented intent.');
        assert.equal(await pilot.recall('src/a.ts'), null);
        const response = { done: true, done_reason: 'stop', model: 'stub-offline', message: { role: 'assistant', content: JSON.stringify({ claims: [{ text: 'Offline stub; no model accuracy established.', evidenceIds: ['e1'] }], unknowns: [] }) } };
        let invoked, settle;
        const ready = new Promise(resolve => { invoked = resolve; });
        const blocked = new EvidencePilot({ root, events, collect: fastScan, idleMs: 10000,
            summarize: async (_messages, { signal }) => { invoked(signal); return new Promise(resolve => { settle = () => resolve(response); }); } });
        blocked.start(['src/a.ts']);
        const running = blocked.runOnce();
        const signal = await ready;
        events.emit(Events.REQUEST_STARTED, { requestId: 'one' });
        events.emit(Events.REQUEST_STARTED, { requestId: 'two' });
        assert(signal.aborted);
        events.emit(Events.REQUEST_COMPLETED, { requestId: 'one' });
        assert.equal((await blocked.runOnce()).status, 'deferred');
        events.emit(Events.REQUEST_COMPLETED, { requestId: 'two' });
        assert.equal((await blocked.runOnce()).status, 'deferred'); // Provider ignored abort; lock retained.
        settle();
        await assert.rejects(running, /cancelled/);
        assert.equal(await blocked.recall('src/a.ts'), null);
        await blocked.stop();
        const good = new EvidencePilot({ root, collect: fastScan, summarize: async () => response });
        assert.equal((await good.runOnce(['src/a.ts'])).outcomes[0].status, 'unverified_summary');
        assert.equal((await good.recall('src/a.ts')).summary.status, 'MODEL_INTERPRETATION_UNVERIFIED');
        await good.stop();
        await write('src/b.ts', 'export const twice = 4;');
        const changing = new EvidencePilot({ root, collect: fastScan, summarize: async () => { await write('src/b.ts', 'export const twice = 5;'); return response; } });
        await assert.rejects(changing.runOnce(['src/a.ts']), /Source changed/);
        assert.equal(await changing.recall('src/a.ts'), null);
        await changing.stop();
        // Removed graph edges still invalidate their former importers.
        const { affectedTargets, compare } = require('../src/reasoning/evidencePilot/dependencies');
        assert.deepEqual(affectedTargets({ links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] }, { links: [] }, ['c']), ['a', 'b', 'c']);
        assert.throws(() => compare(graph, {}), /Invalid/);
        let calls = 0, scans = 0;
        const scheduled = new EvidencePilot({ root, events, idleMs: 5, pollMs: 20,
            collect: async (...args) => { scans++; return fastScan(...args); }, summarize: async () => { calls++; return response; } });
        scheduled.start(['src/a.ts', 'src/a.ts']);
        const waitUntil = async predicate => {
            const deadline = Date.now() + 5000;
            while (!predicate()) { if (Date.now() > deadline) throw new Error('Scheduler test timed out.'); await new Promise(resolve => setTimeout(resolve, 10)); }
        };
        await waitUntil(() => calls === 1 && !scheduled.active);
        await waitUntil(() => scans >= 4 && !scheduled.active);
        assert.equal(calls, 1); // Repeated polls never repeat an unchanged summary.
        events.emit(Events.REQUEST_STARTED, { requestId: 'foreground' });
        const before = scans;
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal(scans, before);
        events.emit(Events.REQUEST_CANCELLED, { requestId: 'foreground' });
        await waitUntil(() => scans > before);
        await scheduled.stop();
        assert.equal(events.listenerCount(Events.REQUEST_STARTED), 0);
        await write('src/b.ts', 'export const twice = 6;');
        let failures = 0;
        const invalid = new EvidencePilot({ root, collect: fastScan, summarize: async () => { failures++; return { ...response, done_reason: 'length' }; } });
        assert.equal((await invalid.runOnce(['src/a.ts'])).outcomes[0].status, 'evidence_only');
        assert((await invalid.recall('src/a.ts')).audit.error.includes('Incomplete'));
        await invalid.runOnce(['src/a.ts']);
        assert.equal(failures, 1); // No automatic model retry loop for failed summaries.
        await invalid.stop();
        let correctedCalls = 0;
        const corrected = new EvidencePilot({ root, collect: fastScan, summaryKey: 'changed-generation-profile',
            summarize: async () => { correctedCalls++; return response; } });
        assert.equal((await corrected.runOnce(['src/a.ts'])).outcomes[0].status, 'unverified_summary');
        assert.equal((await corrected.runOnce(['src/a.ts'])).outcomes[0].status, 'cached');
        assert.equal(correctedCalls, 1); // A new profile replaces a cached failure without source edits or endless retries.
        await corrected.stop();
        const outlineContract = require('../src/reasoning/evidencePilot/outline');
        let outlineCalls = 0;
        const outlined = new EvidencePilot({ root, collect: fastScan, summaryKey: generationProfile('outline').summaryKey,
            summaryContract: outlineContract, summarize: async request => {
                outlineCalls++;
                assert(request[0].content.includes('operationIds'));
                const supplied = JSON.parse(request[1].content);
                const excerpt = supplied.evidence.find(e => e.kind === 'excerpt');
                return { ...response, message: { role: 'assistant', content: JSON.stringify({
                    purpose: [{ text: 'Inferred helper delegation.', evidenceIds: [excerpt.id] }],
                    operationIds: supplied.operations.facts.slice(0, 1).map(f => f.id), unknowns: [] }) } };
            } });
        assert.equal((await outlined.runOnce(['src/a.ts'])).outcomes[0].status, 'unverified_summary');
        const outlineRecord = await outlined.recall('src/a.ts');
        assert.equal(outlineRecord.summary.contract, 'operation-outline-2');
        assert.deepEqual(outlineRecord.summary.selectedOperations[0], outlineRecord.packet.operations.facts[0]);
        assert.equal((await outlined.runOnce(['src/a.ts'])).outcomes[0].status, 'cached');
        assert.equal(outlineCalls, 1);
        await outlined.stop();
        const malformed = new EvidencePilot({ root, collect: fastScan, summaryKey: 'bad-envelope',
            summarize: async () => ({ ...response, message: { ...response.message, role: 'user', tool_calls: [{}] } }) });
        assert.equal((await malformed.runOnce(['src/a.ts'])).outcomes[0].status, 'evidence_only');
        assert.deepEqual((await malformed.recall('src/a.ts')).audit.completion.issues, ['unexpected_message_role', 'unexpected_tool_calls']);
        await malformed.stop();
        await write('src/b.ts', 'export const twice = 7;');
        let timeoutCalls = 0;
        const timeout = new EvidencePilot({ root, collect: fastScan, modelTimeoutMs: 5,
            summarize: async (_messages, { signal }) => { timeoutCalls++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })); } });
        assert.equal((await timeout.runOnce(['src/a.ts'])).outcomes[0].status, 'evidence_only');
        assert((await timeout.recall('src/a.ts')).audit.error.includes('deadline exceeded'));
        assert.equal((await timeout.runOnce(['src/a.ts'])).outcomes[0].status, 'cached');
        assert.equal(timeoutCalls, 1);
        await timeout.stop();
        // Even if a provider ignores its deadline, retain the lock until settlement
        // and reject the late response instead of accepting it or launching overlap.
        let lateStarted, lateFinish;
        const lateReady = new Promise(resolve => { lateStarted = resolve; });
        const late = new EvidencePilot({ root, collect: fastScan, summaryKey: 'late-provider', modelTimeoutMs: 5,
            summarize: async (_messages, { signal }) => { lateStarted(signal); return new Promise(resolve => { lateFinish = () => resolve(response); }); } });
        const lateRun = late.runOnce(['src/a.ts']);
        const lateSignal = await lateReady;
        await new Promise(resolve => setTimeout(resolve, 20));
        assert(lateSignal.aborted);
        assert.equal((await late.runOnce(['src/a.ts'])).status, 'deferred');
        lateFinish();
        assert.equal((await lateRun).outcomes[0].status, 'evidence_only');
        assert.equal((await late.recall('src/a.ts')).summary, null);
        await late.stop();
        const completedBeforeRace = await pilot.store.read('current.json');
        let reviewProbes = 0;
        const racingReview = new EvidencePilot({ root, collect: async (...args) => {
            if (++reviewProbes === 2) await pilot.store.write('current.json', { ...completedBeforeRace, state: 'refreshing' });
            return fastScan(...args);
        } });
        const raced = await racingReview.readCurrentRecords(['src/a.ts']);
        assert.equal(raced.status, 'stale');
        assert.deepEqual(raced.records, []);
        await pilot.store.write('current.json', completedBeforeRace);
        await racingReview.stop();
        // Worker-thread cancellation keeps compiler work off the conversation event loop.
        const controller = new AbortController();
        const pending = scan(root, null, controller.signal);
        controller.abort();
        await assert.rejects(pending, /cancelled/);
        const threaded = await scan(root, undefined, undefined, { targets: ['src/a.ts'] });
        assert.equal(threaded.graph.dependencyCruiser.status, 'compared');
        assert(threaded.graph.packets['src/a.ts']);
        const original = require('../src/reasoning/evidencePilot/store').readEvidenceSync(path.join(root, '.local/connected-evidence-test', threaded.graph.evidenceFile));
        assert(threaded.graph.evidenceFile.endsWith('.json.gz'));
        assert(original.snapshot.files['src/b.ts'].source.includes('twice = 7'));
        assert(original.records['src/b.ts'].symbols.length);
        const filesBeforeProbe = (await fs.readdir(pilot.store.directory)).sort();
        const changedProbe = await scan(root, 'not-the-current-version', undefined, { checkOnly: true });
        assert.equal(changedProbe.unchanged, false);
        assert.equal(changedProbe.graph, undefined);
        assert.deepEqual((await fs.readdir(pilot.store.directory)).sort(), filesBeforeProbe);
        console.log('Connected evidence: static relationships, provenance, budgets, cache, edits/deletions/new dependencies, docs, cancellation and stale-response rejection passed.');
    } finally { await pilot.stop(); await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
