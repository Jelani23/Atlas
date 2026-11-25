const path = require('node:path');
const { spawn } = require('node:child_process');
const { readConfig, resolveLaunchConfig } = require('../electron/launchConfig');
const root = path.resolve(__dirname, '..');

async function main() {
    const launch = resolveLaunchConfig({ config: readConfig(root) });
    const resources = [launch.rendererUrl];
    if (launch.role === 'host') resources.push(`http://127.0.0.1:${launch.port}/health`);
    // Clients can open while the host is offline and use the normal WS reconnect.
    await require('wait-on')({ resources, timeout: 180000, httpTimeout: 3000 });
    const env = { ...process.env, ATLAS_ROLE: launch.role, ATLAS_WS_URL: launch.backendUrl, ATLAS_RENDERER_URL: launch.rendererUrl };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), ['.'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
main().catch(error => { console.error('[Atlas] Electron startup failed:', error.message); process.exitCode = 1; });
