// Talks only to the running local application; never starts a second pilot.
const WebSocket = require('ws');
const focus = process.argv[2] || 'execution';
if (process.argv.length > 3 || !['execution', 'cancellation', 'creation', 'overview'].includes(focus)) {
    console.error('Usage: node backend/scripts/reanalyzeConnectedEvidence.js [execution|cancellation|creation|overview]');
    process.exitCode = 1;
} else {
    const port = Number(process.env.ATLAS_PORT || 7341);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ATLAS_PORT.');
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let received = false;
    const id = require('node:crypto').randomUUID();
    const timer = setTimeout(() => { console.error('Application control request timed out.'); process.exitCode = 1; ws.terminate(); }, 10000);
    ws.on('open', () => ws.send(JSON.stringify({ id, method: 'reanalyzeConnectedEvidence', args: [focus] })));
    ws.on('message', data => {
        let message;
        try { message = JSON.parse(data.toString()); } catch { return; }
        if (message.id !== id) return;
        received = true;
        if (message.error) { console.error(message.error); process.exitCode = 1; }
        else console.log(JSON.stringify(message.result, null, 2));
        clearTimeout(timer); ws.close();
    });
    ws.on('error', error => { console.error(error.message); process.exitCode = 1; clearTimeout(timer); });
    ws.on('close', () => {
        clearTimeout(timer);
        if (!received) { console.error('Application closed before acknowledging reanalysis.'); process.exitCode = 1; }
    });
}
