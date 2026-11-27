const { randomUUID } = require('node:crypto');
const { runWithInteraction } = require('./interactionContext');
const { normalizeScreens, validateCapture } = require('./screenContext');

// Connection-local protocol boundary; RPC arguments cannot impersonate another
// registered device. Voice receipts bind STT output to its original interaction.
function createClientSession(registry, transport, { now = Date.now } = {}) {
    const connectionId = registry.connect(transport);
    const transcripts = new Map();
    const taskReceipts = new Map();
    let closed = false;
    let preparation;
    return {
        connectionId,
        close() { preparation?.abort(); closed = true; transcripts.clear(); taskReceipts.clear(); registry.disconnect(connectionId); },
        async dispatch(method, args, atlas, fallback) {
            if (closed) throw new Error('Client disconnected');
            if (!Array.isArray(args)) throw new Error('RPC args must be an array');
            if (method === 'registerClient') return registry.register(connectionId, args[0]);
            if (method === 'getClientDevice') return registry.snapshot(connectionId);
            if (method === 'listDevices') return registry.listDevices(connectionId, normalizeScreens(args[0], now()));
            if (method === 'interrupt') { preparation?.abort(); taskReceipts.clear(); }
            if (method === 'prepareTask') {
                preparation?.abort();
                const controller = preparation = new AbortController();
                taskReceipts.clear();
                const text = args[0], sessionId = atlas.sessionId;
                const state = require('../planner/state');
                const scope = state.runInSession(sessionId, () => state.getSessionScope());
                const interaction = registry.snapshot(connectionId);
                const screens = normalizeScreens(args[1], now());
                const intent = await require('../intent/prepareInput').prepare(text, { sessionId, interaction, screens }, { signal: controller.signal });
                if (controller.signal.aborted || closed || scope.closed || atlas.sessionId !== sessionId) throw new Error('Conversation changed while interpreting the request');
                for (const [id, entry] of taskReceipts) if (now() - entry.at > 120000) taskReceipts.delete(id);
                if (taskReceipts.size >= 8) taskReceipts.delete(taskReceipts.keys().next().value);
                const taskReceipt = randomUUID();
                taskReceipts.set(taskReceipt, { text, intent, sessionId, scope, at: now() });
                return { taskReceipt, intent };
            }
            if (method === 'sendMessage') {
                let interaction = registry.snapshot(connectionId);
                let taskIntent;
                if (args[1]?.taskReceipt !== undefined) {
                    const receipt = taskReceipts.get(args[1].taskReceipt);
                    taskReceipts.delete(args[1].taskReceipt);
                    if (!receipt || receipt.scope.closed || receipt.text !== args[0] || receipt.sessionId !== atlas.sessionId || now() - receipt.at > 120000)
                        throw new Error('Task request expired or changed. Please try again.');
                    taskIntent = receipt.intent;
                }
                const receiptId = args[1]?.transcriptionId;
                if (receiptId !== undefined) {
                    const receipt = transcripts.get(receiptId);
                    transcripts.delete(receiptId);
                    if (!receipt || now() - receipt.createdAt > 120000 || receipt.text !== args[0]) throw new Error('Voice transcript expired or does not match this connection; record again');
                    interaction = receipt.interaction;
                }
                const screens = normalizeScreens(args[1]?.screens, now());
                const screenCapture = validateCapture(args[1]?.screenCapture, screens, now());
                if (taskIntent?.displayId && screenCapture?.displayId !== taskIntent.displayId) throw new Error('Wordle capture does not match the requested monitor');
                const unavailable = args[1]?.requestedMonitorUnavailable;
                let screenRequestError;
                if (args[1]?.requestedOtherMonitorIssue === true) {
                    if (!screens || screenCapture || unavailable !== undefined || screens.displays.length === 2) throw new Error('Invalid other-monitor report');
                    const count = screens.displays.length;
                    screenRequestError = count < 2
                        ? `This device ${count === 1 ? 'only has 1 connected screen' : 'has no connected screens'}, so there isn't another screen to look at.`
                        : `This device has ${count} connected screens. Which monitor number should I look at? You can ask for monitor 1 through ${count}.`;
                }
                if (unavailable !== undefined) {
                    if (!Number.isSafeInteger(unavailable) || !screens || screenCapture || (unavailable >= 1 && unavailable <= screens.displays.length)) throw new Error('Invalid unavailable-monitor report');
                    const count = screens.displays.length;
                    screenRequestError = `I can't look at monitor ${unavailable} because this device ${count === 0 ? 'has no connected screens' : `only has ${count} connected screen${count === 1 ? '' : 's'}`}.${count > 0 ? ` Available monitor${count === 1 ? '' : 's'}: ${count === 1 ? '1' : `1 through ${count}`}.` : ''}`;
                }
                if (screenCapture && !interaction.client?.capabilities.screenshot.supported) throw new Error('This client has not registered screenshot support');
                // Read at execution time, not interpretation time: another device
                // may have disconnected while the parser was working.
                const deviceInventory = taskIntent?.task === 'devices' && interaction.client
                    ? registry.listDevices(connectionId, screens) : undefined;
                interaction = Object.freeze({ ...interaction, screens, deviceInventory, manualWordleRequested: /^(?:please\s+)?wordle\s*:/i.test(args[0]) });
                if (taskIntent) {
                    const state = require('../planner/state');
                    const scope = state.runInSession(atlas.sessionId, () => state.getSessionScope());
                    scope.inputRecent = [...(scope.inputRecent || []), { connectionId, text: String(args[0]).slice(0, 500) }].slice(-8);
                }
                return runWithInteraction(interaction, async () => ({ ok: true, ...await atlas.sendMessage(args[0], interaction, { screenCapture, screenRequestError, taskIntent }) }));
            }
            if (method === 'transcribeAudio') {
                const interaction = registry.snapshot(connectionId, 'voice');
                const result = await runWithInteraction(interaction, () => atlas.transcribeAudio(args[0]));
                if (!result.ok || closed) return result;
                for (const [id, entry] of transcripts) if (now() - entry.createdAt > 120000) transcripts.delete(id);
                if (transcripts.size >= 16) transcripts.delete(transcripts.keys().next().value);
                const transcriptionId = randomUUID();
                transcripts.set(transcriptionId, { text: result.text, interaction, createdAt: now() });
                return { ...result, transcriptionId };
            }
            return fallback();
        },
    };
}
module.exports = { createClientSession };
