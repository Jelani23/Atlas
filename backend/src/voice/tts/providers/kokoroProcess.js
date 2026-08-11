// backend/src/voice/tts/providers/kokoroProcess.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../ttsConfig');

let kokoroProcess = null;
let startingPromise = null;

function getPaths() {
    const root = config.kokoro.root;
    return {
        root,
        python: path.join(root, 'python', 'python.exe'),
        script: path.join(root, 'scripts', 'gradio_v5', 'gradio_inf.py')
    };
}

function validateInstallation() {
    const paths = getPaths();

    if (!paths.root) {
        throw new Error('KOKORO_ROOT is not configured.');
    }

    if (!fs.existsSync(paths.python)) {
        throw new Error(`Kokoro Python executable not found: ${paths.python}`);
    }

    if (!fs.existsSync(paths.script)) {
        throw new Error(`Kokoro launcher script not found: ${paths.script}`);
    }

    return paths;
}

function isRunning() {
    return kokoroProcess && !kokoroProcess.killed;
}

function start() {
    if (isRunning()) {
        return Promise.resolve();
    }

    if (startingPromise) {
        return startingPromise;
    }

    startingPromise = new Promise((resolve, reject) => {
        let paths;

        try {
            paths = validateInstallation();
        } catch (error) {
            startingPromise = null;
            reject(error);
            return;
        }

        console.log('[Kokoro Process] Starting Kokoro...');
        console.log(`[Kokoro Process] Root: ${paths.root}`);

        const child = spawn(
            paths.python,
            [paths.script],
            {
                cwd: paths.root,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        kokoroProcess = child;

        child.stdout.on('data', data => {
            const output = data.toString().trim();
            if (output) {
                console.log(`[Kokoro] ${output}`);
            }
        });

        child.stderr.on('data', data => {
            const output = data.toString().trim();
            if (output) {
                console.log(`[Kokoro] ${output}`);
            }
        });

        child.on('error', error => {
            console.error('[Kokoro Process] Failed to start:', error.message);
            kokoroProcess = null;
            startingPromise = null;
            reject(error);
        });

        child.on('exit', (code, signal) => {
            console.log(`[Kokoro Process] Exited (code=${code}, signal=${signal})`);
            kokoroProcess = null;
        });

        // The process being spawned does NOT mean Kokoro is ready.
        // The caller must wait for the HTTP health check.
        resolve();
    });

    return startingPromise;
}

function stop() {
    if (!isRunning()) {
        return;
    }

    console.log('[Kokoro Process] Stopping Kokoro...');

    kokoroProcess.kill();
    kokoroProcess = null;
    startingPromise = null;
}

module.exports = {
    start,
    stop,
    isRunning,
    validateInstallation
};