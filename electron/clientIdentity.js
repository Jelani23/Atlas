const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Installation identity, not a hardware fingerprint or authentication credential.
function loadClientIdentity(directory, { platform = process.platform, env = process.env } = {}) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'atlas-client-device.json');
    let saved;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot read client identity: ${error.message}`); }
    if (saved && !/^[0-9a-f-]{36}$/i.test(saved.deviceId || '')) throw new Error('Invalid saved client identity');
    const os = ({ win32: 'windows', darwin: 'macos', linux: 'linux' })[platform] || 'unknown';
    const identity = {
        deviceId: saved?.deviceId || randomUUID(),
        displayName: env.ATLAS_DEVICE_NAME || saved?.displayName || ({ windows: 'Windows PC', macos: 'Mac' })[os] || 'Desktop client',
        deviceKind: env.ATLAS_DEVICE_KIND || saved?.deviceKind || 'desktop',
    };
    if (JSON.stringify(saved) !== JSON.stringify(identity)) {
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(identity, null, 2));
        fs.renameSync(`${file}.tmp`, file);
    }
    return {
        schemaVersion: 1, ...identity, os, clientType: 'electron',
        capabilities: {
            textInput: { supported: true, permission: 'not-required' },
            audioPlayback: { supported: true, permission: 'not-required' },
            microphone: { supported: true, permission: 'unknown' },
            screenshot: { supported: true, permission: 'prompt' },
            camera: { supported: false, permission: 'unknown' },
        },
    };
}
module.exports = { loadClientIdentity };
