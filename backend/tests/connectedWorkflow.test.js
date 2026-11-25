const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runWorkflow } = require('../scripts/evaluateConnectedWorkflow');

(async () => {
    const session = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workflow-test-'));
    const root = path.join(session, 'backend');
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/task.js'), 'exports.run = function(bus) { bus.emit("done"); };');
    let active = 0;
    const phases = [];
    try {
        const report = await runWorkflow({ root, target: 'src/task.js', request: async (messages, signal, phase) => {
            assert.equal(active, 0, 'Foreground and background client requests must not overlap.');
            active++;
            phases.push(phase);
            try {
                if (phase === 'background-interruption') {
                    // Delayed settlement verifies that abort dispatch alone does not
                    // permit the foreground request to start.
                    await new Promise((resolve, reject) => signal.addEventListener('abort', () => {
                        setTimeout(() => reject(new Error('Aborted fixture request.')), 40);
                    }, { once: true }));
                }
                const packet = phase !== 'foreground' && JSON.parse(messages[1].content);
                return { done: true, done_reason: 'stop', message: { role: 'assistant', content: packet
                    ? JSON.stringify({ purpose: [], operationIds: packet.operations.facts.slice(0, 1).map(f => f.id), unknowns: [] })
                    : 'ready' } };
            } finally { active--; }
        } });
        assert.equal(report.status, 'passed');
        assert.equal(report.checks.length, 4);
        assert(report.checks[0].clientSettlementMs >= 35);
        assert.deepEqual(phases, ['background-interruption', 'foreground', 'background', 'background']);
        assert.equal(report.backgroundModelCalls, 3);

        const controller = new AbortController();
        controller.abort();
        await assert.rejects(runWorkflow({ root, target: 'src/task.js', signal: controller.signal,
            request: () => { throw new Error('Must not request a model.'); } }), /Workflow cancelled/);
        console.log('Connected workflow rehearsal passed (real compiler workers; simulated model).');
    } finally { await fs.rm(session, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
