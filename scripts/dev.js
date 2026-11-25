const path = require('node:path');
const { readConfig, resolveLaunchConfig, developmentCommands } = require('../electron/launchConfig');
const root = path.resolve(__dirname, '..');

async function main() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith('--role=')) process.env.ATLAS_ROLE = arg.slice(7);
        else if (arg !== '--dry-run') throw new Error(`Unknown launch argument: ${arg}`);
    }
    const launch = resolveLaunchConfig({ config: readConfig(root) });
    const commands = developmentCommands(launch);
    console.log(`[Atlas] ${launch.role.toUpperCase()} mode | backend ${launch.backendUrl}`);
    console.log(`[Atlas] Local renderer ${launch.rendererUrl} | ${launch.role === 'host' ? 'starting local backend' : 'no local backend or model services'}`);
    if (args.includes('--dry-run')) {
        console.log(JSON.stringify(commands, null, 2));
        return;
    }
    const env = {
        ATLAS_ROLE: launch.role, ATLAS_WS_URL: launch.backendUrl,
        ATLAS_PORT: launch.port, ATLAS_RENDERER_URL: launch.rendererUrl,
    };
    const { result } = require('concurrently')(commands.map(command => ({ ...command, env })), {
        cwd: root, killOthersOn: ['success', 'failure'], successCondition: 'first',
    });
    await result;
}
main().catch(error => { console.error('[Atlas] Launch failed:', error.message || 'A child process exited unsuccessfully'); process.exitCode = 1; });
