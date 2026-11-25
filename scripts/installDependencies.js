const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readConfig, resolveLaunchConfig } = require('../electron/launchConfig');
const root = path.resolve(__dirname, '..');
try {
    const launch = resolveLaunchConfig({ config: readConfig(root) });
    // Use npm's own JS entrypoint to avoid cmd.exe quoting and shell execution.
    if (!process.env.npm_execpath) throw new Error('Run dependency installation through npm install');
    const directories = launch.role === 'host' ? ['backend', 'renderer'] : ['renderer'];
    for (const directory of directories) {
        console.log(`[Atlas] Installing ${directory} dependencies (${launch.role} mode)`);
        const result = spawnSync(process.execPath, [process.env.npm_execpath, '--prefix', directory, 'install'], { cwd: root, stdio: 'inherit', windowsHide: true });
        if (result.error) throw result.error;
        if (result.status !== 0) { process.exitCode = result.status || 1; break; }
    }
} catch (error) { console.error('[Atlas] Dependency installation failed:', error.message); process.exitCode = 1; }
