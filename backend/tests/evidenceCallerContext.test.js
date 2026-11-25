const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { snapshot, collect } = require('../src/reasoning/evidencePilot/collector');
const { buildContext } = require('../src/reasoning/evidencePilot/context');
(async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-callers-'));
    const root = path.join(temp, 'backend');
    try {
        await fs.mkdir(path.join(root, 'src'), { recursive: true });
        await fs.writeFile(path.join(root, 'src/task.ts'), 'export function execute(n: number) { if (n < 0) throw new Error("negative"); return n + 1; }');
        await fs.writeFile(path.join(root, 'src/caller.ts'), 'import { execute } from "./task"; export function caller() { return execute(2); }');
        await fs.writeFile(path.join(root, 'src/unrelated.ts'), 'function execute() { return 99; } export function unrelated() { return execute(); }');
        const graph = collect(snapshot(root));
        const packet = buildContext(graph, 'src/task.ts', { targetSymbol: 'execute', includeCallers: true, maxChars: 12000 });
        assert(packet.evidence.some(e => e.path === 'src/caller.ts' && e.text?.includes('function caller() { return execute(2); }')));
        assert(!packet.evidence.some(e => e.path === 'src/unrelated.ts'));
        assert(packet.evidence[0].text.includes('if (n < 0) throw'));
        assert(JSON.stringify(packet).length <= 12000);
        const plain = buildContext(graph, 'src/task.ts', { targetSymbol: 'execute', maxChars: 12000 });
        assert(!plain.evidence.some(e => e.path === 'src/caller.ts'));
        assert.notEqual(packet.fingerprint, plain.fingerprint);
        console.log('Compiler-resolved caller context tests passed.');
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
