// src/tools/development/runTests.js
const path = require('path');
const { exec } = require('child_process');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function runTests() {
    return new Promise((resolve) => {
        exec('npm test', { cwd: BACKEND_ROOT, timeout: 60000 }, (error, stdout, stderr) => {
            if (error) resolve(`Tests finished with errors or failures.\nStdout:\n${stdout}\nStderr:\n${stderr}`);
            else resolve(`Tests passed successfully.\nStdout:\n${stdout}`);
        });
    });
}

module.exports = {
    execute: runTests,
    intentSchema: {
        name: 'runTests',
        domain: 'TASKS',
        triggers: ['run tests', 'npm test', 'test suite', 'run the test', 'run tests'],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};