const { randomUUID } = require('node:crypto');
const { runWithInteraction } = require('./interactionContext');

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
                return runWithInteraction(interaction, async () => ({ ok: true, ...await atlas.sendMessage(args[0], interaction) }));
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
