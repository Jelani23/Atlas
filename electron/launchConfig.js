const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readConfig(root) {
    const read = name => {
        try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
        catch (error) {
            if (error.code === 'ENOENT') return {};
            throw new Error(`Cannot read ${name}: ${error.message}`);
        }
    };
    return { ...read('atlas.config.json'), ...read('atlas.local.json') };
}

function resolveLaunchConfig({ config = {}, env = process.env, platform = process.platform, hostname = os.hostname() } = {}) {
    const requestedRole = env.ATLAS_ROLE || config.role || 'auto';
    if (!['auto', 'host', 'client'].includes(requestedRole)) throw new Error('ATLAS_ROLE must be auto, host, or client');
    // Match the designated Windows host, not every Windows machine on the tailnet.
    const designatedHost = platform === 'win32' && typeof config.hostHostname === 'string'
        && hostname.toLowerCase() === config.hostHostname.toLowerCase();
    const role = requestedRole === 'auto' ? (designatedHost ? 'host' : 'client') : requestedRole;
    const port = String(env.ATLAS_PORT || config.port || 7341);
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid ATLAS_PORT');
    const backendUrl = env.ATLAS_WS_URL || (role === 'host' ? `ws://127.0.0.1:${port}` : config.backendUrl);
    if (!backendUrl) throw new Error('Client mode needs backendUrl in atlas.local.json or ATLAS_WS_URL');
    let parsed;
    try { parsed = new URL(backendUrl); } catch { throw new Error('Invalid backend WebSocket URL'); }
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error('Backend URL must use ws:// or wss:// without credentials or fragments');
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (role === 'host' && (!loopback || parsed.protocol !== 'ws:' || (parsed.port || '80') !== port || parsed.pathname !== '/' || parsed.search)) {
        throw new Error('Host mode must connect to its local ATLAS_PORT. Use ATLAS_ROLE=client for a remote backend.');
    }
    return Object.freeze({ role, backendUrl: parsed.href, port, rendererUrl: 'http://localhost:3000', shutdownBackendOnExit: role === 'host' });
}

function developmentCommands(launch) {
    const commands = [{ command: 'npm run dev:renderer', name: 'RENDERER', prefixColor: 'blue' }];
    if (launch.role === 'host') commands.push({ command: 'npm run dev:backend', name: 'BACKEND', prefixColor: 'magenta' });
    commands.push({ command: 'node scripts/startElectron.js', name: 'ELECTRON', prefixColor: 'green' });
    return commands;
}
module.exports = { readConfig, resolveLaunchConfig, developmentCommands };
