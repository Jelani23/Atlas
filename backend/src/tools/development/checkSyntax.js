// src/tools/development/checkSyntax.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function checkSyntax(filePath) {
    return new Promise((resolve) => {
        if (!filePath) return resolve("Error: No file path provided.");
        
        const fullPath = path.join(BACKEND_ROOT, filePath);
        if (!fs.existsSync(fullPath)) return resolve(`Error: File ${filePath} does not exist.`);

        exec(`node -c "${fullPath}"`, (error, stdout, stderr) => {
            if (error) resolve(`Syntax Error in ${filePath}:\n${stderr}`);
            else resolve(`Syntax OK: ${filePath} is valid JavaScript.`);
        });
    });
}

module.exports = {
    execute: checkSyntax,
    intentSchema: {
        name: 'checkSyntax',
        domain: 'FILES',
        triggers: ["check syntax","validate"],
        requiredEntities: ["FILE"],
        extractParams: (message, entities) => {
            const file = entities.find(e => e.type === 'FILE');
            let filename = file ? file.value : null;
            // Resolve the full path using the project cache
            if (filename) {
                const projectCache = require('../../core/projectCache');
                const foundPath = projectCache.findFile(filename);
                if (foundPath) return [foundPath];
            }
            return [filename];
        }
    }
};
