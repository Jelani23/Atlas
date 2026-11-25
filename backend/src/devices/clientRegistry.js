const { randomUUID } = require('node:crypto');
const CAPABILITIES = ['textInput', 'audioPlayback', 'microphone', 'screenshot', 'camera'];
const oneOf = (value, choices, field) => {
    if (!choices.includes(value)) throw new Error(`Invalid client ${field}`);
    return value;
};
function normalizeClient(value) {
    if (!value || value.schemaVersion !== 1) throw new Error('Unsupported client schemaVersion');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.deviceId || '')) throw new Error('Invalid client deviceId');
    if (typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 80 || /[\x00-\x1f\x7f]/.test(value.displayName)) throw new Error('Invalid client displayName');
    const capabilities = {};
    for (const key of CAPABILITIES) {
        const capability = value.capabilities?.[key];
        if (capability && typeof capability.supported !== 'boolean') throw new Error(`Invalid capability ${key}`);
        capabilities[key] = Object.freeze({
            supported: capability?.supported === true,
            permission: oneOf(capability?.permission || 'unknown', ['unknown', 'granted', 'denied', 'prompt', 'not-required'], 'capability permission'),
        });
    }
    return Object.freeze({
        schemaVersion: 1, deviceId: value.deviceId.toLowerCase(), displayName: value.displayName.trim(),
        os: oneOf(value.os, ['windows', 'macos', 'linux', 'ios', 'watchos', 'android', 'unknown'], 'os'),
        clientType: oneOf(value.clientType, ['electron', 'browser', 'native', 'cli', 'unknown'], 'type'),
        deviceKind: oneOf(value.deviceKind, ['desktop', 'laptop', 'phone', 'watch', 'tablet', 'unknown'], 'kind'),
        capabilities: Object.freeze(capabilities), trust: 'self-reported',
    });
}
function createClientRegistry() {
    const connections = new Map();
    return {
        connect(transport) {
            const connectionId = randomUUID();
            connections.set(connectionId, { transport, client: null });
            return connectionId;
        },
        register(connectionId, value) {
            const entry = connections.get(connectionId);
            if (!entry) throw new Error('Client disconnected');
            if (entry.client) throw new Error('Client already registered on this connection');
            entry.client = normalizeClient(value);
            return this.snapshot(connectionId);
        },
        snapshot(connectionId, inputSource = 'text') {
            return Object.freeze({ connectionId, inputSource, client: connections.get(connectionId)?.client || null });
        },
        disconnect(connectionId) { connections.delete(connectionId); },
        resolveTarget(interaction, capability) {
            const entry = connections.get(interaction?.connectionId);
            if (!entry) return { ok: false, reason: 'disconnected' };
            if (!entry.client || entry.client.deviceId !== interaction?.client?.deviceId) return { ok: false, reason: 'unknown-client' };
            const registered = entry.client.capabilities[capability];
            if (!registered?.supported) return { ok: false, reason: 'unsupported' };
            if (!['granted', 'not-required'].includes(registered.permission)) return { ok: false, reason: 'permission-unavailable' };
            // Eligibility only. Tools must still enforce their own permissions and
            // the client must check live OS consent/availability before capture.
            return { ok: true, connectionId: interaction.connectionId, transport: entry.transport };
        },
    };
}
module.exports = { normalizeClient, createClientRegistry };
