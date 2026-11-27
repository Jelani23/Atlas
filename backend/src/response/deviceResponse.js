const { envelope } = require('./resultEnvelope');
const labels = { textInput: 'text conversation', audioPlayback: 'audio playback', microphone: 'microphone', screenshot: 'screen sharing', camera: 'camera' };
const osNames = { windows: 'Windows', macos: 'macOS', linux: 'Linux', ios: 'iOS', android: 'Android', watchos: 'watchOS', unknown: 'unknown OS' };
const plain = text => String(text).replace(/[\r\n`*_#<>\[\]]/g, '').trim();
function permission(value) {
    return ({ granted: 'allowed', 'not-required': 'no permission needed', denied: 'permission denied', restricted: 'restricted', prompt: 'needs permission', 'not-determined': 'needs permission' })[value] || 'permission not checked';
}
const defaultQuery = { scope: 'all', topic: 'status', name: '' };
function selectDevices(inventory, query) {
    const devices = inventory?.devices || [];
    if (query.scope === 'current') return devices.filter(device => device.current);
    if (query.scope !== 'named') return devices;
    const name = query.name.trim().toLowerCase();
    const exact = devices.filter(device => device.client.displayName.toLowerCase() === name);
    if (exact.length) return exact;
    // Alias matching selects registered records only; it never invents hardware.
    return devices.filter(({ client }) => {
        const aliases = [client.os, osNames[client.os]?.toLowerCase(), client.deviceKind];
        if (client.os === 'macos') aliases.push('mac', ...(client.deviceKind === 'laptop' ? ['macbook'] : []));
        if (client.os === 'windows') aliases.push('pc', 'windows pc');
        return aliases.includes(name);
    });
}
function render(inventory, query = defaultQuery) {
    const devices = selectDevices(inventory, query);
    if (query.scope === 'current' && devices.length !== 1) return 'I can’t identify the device sending this message from its registration.';
    if (query.scope === 'named' && devices.length !== 1) return devices.length
        ? `More than one registered device matches ${plain(query.name)}. Which one do you mean: ${devices.map(d => plain(d.client.displayName)).join(', ')}?`
        : `I don’t have a registered device matching ${plain(query.name)}.`;
    if (!devices.length) return 'I don’t have any registered devices to report yet.';
    if (query.scope === 'current' && query.topic === 'status') {
        const client = devices[0].client;
        return `You’re messaging me from ${plain(client.displayName)}, running ${osNames[client.os] || 'an unknown operating system'}.`;
    }
    const lines = [];
    for (const device of devices) {
        const { client, screens } = device;
        let line = `${plain(client.displayName)} — ${device.online ? 'online' : 'offline'}${device.current ? ', this device' : ''}.`;
        if (query.topic === 'capabilities' || query.topic === 'details') {
            const capabilities = Object.entries(labels).filter(([key]) => client.capabilities[key]?.supported).map(([key, label]) => {
                const access = key === 'screenshot' && screens ? screens.permission : client.capabilities[key].permission;
                return `${label} (${permission(access)})`;
            });
            const unsupported = Object.entries(labels).filter(([key]) => !client.capabilities[key]?.supported).map(([, label]) => label);
            line += ` ${device.online ? 'Reports support for' : 'Last reported support for'}: ${capabilities.join(', ') || 'none of the listed capabilities'}.`;
            if (unsupported.length) line += ` Not supported: ${unsupported.join(', ')}.`;
        }
        if (query.topic === 'displays' || query.topic === 'details') {
            if (screens) line += ` ${device.online ? 'Reported displays' : 'Last reported displays'}: ${screens.displays.map(display => `${plain(display.label)} (${display.width} × ${display.height}${display.primary ? ', primary' : ''})`).join('; ') || 'none'}.`;
            else line += ' Display information is unavailable.';
        }
        if (query.topic === 'details' && !device.online) line += ` Last seen ${new Date(device.lastSeen).toISOString()}.`;
        lines.push(line);
    }
    return lines.join('\n');
}
function normalize(inventory, query = defaultQuery) {
    if (!inventory) return envelope({ task: 'devices', status: 'unknown', display: 'I couldn’t read the device inventory. Try again from a connected Atlas client.' });
    return envelope({ task: 'devices', status: 'success', data: { inventory, query }, display: render(inventory, query), metadata: { observedAt: inventory.observedAt } });
}
module.exports = { render, normalize };
