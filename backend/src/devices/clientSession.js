const { randomUUID } = require('node:crypto');
const { runWithInteraction } = require('./interactionContext');
const { normalizeScreens, validateCapture } = require('./screenContext');

// Connection-local protocol boundary; RPC arguments cannot impersonate another
// registered device. Voice receipts bind STT output to its original interaction.
function createClientSession(registry, transport, { now = Date.now } = {}) {
    const connectionId = registry.connect(transport);
    const transcripts = new Map();
    let closed = false;
    return {
        connectionId,
        close() { closed = true; transcripts.clear(); registry.disconnect(connectionId); },
        async dispatch(method, args, atlas, fallback) {
            if (closed) throw new Error('Client disconnected');
            if (!Array.isArray(args)) throw new Error('RPC args must be an array');
            if (method === 'registerClient') return registry.register(connectionId, args[0]);
            if (method === 'getClientDevice') return registry.snapshot(connectionId);
            if (method === 'sendMessage') {
                let interaction = registry.snapshot(connectionId);
                const receiptId = args[1]?.transcriptionId;
                if (receiptId !== undefined) {
                    const receipt = transcripts.get(receiptId);
                    transcripts.delete(receiptId);
                    if (!receipt || now() - receipt.createdAt > 120000 || receipt.text !== args[0]) throw new Error('Voice transcript expired or does not match this connection; record again');
                    interaction = receipt.interaction;
                }
                const screens = normalizeScreens(args[1]?.screens, now());
                const screenCapture = validateCapture(args[1]?.screenCapture, screens, now());
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
                interaction = Object.freeze({ ...interaction, screens });
                return runWithInteraction(interaction, async () => ({ ok: true, ...await atlas.sendMessage(args[0], interaction, { screenCapture, screenRequestError }) }));
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
