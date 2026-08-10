// backend/src/tools/toolRegistry.js
const fs = require('fs');
const path = require('path');

const registry = [];

function loadTools() {
    const toolsDir = __dirname;
    const categories = fs.readdirSync(toolsDir).filter(file => 
        fs.statSync(path.join(toolsDir, file)).isDirectory()
    );

    for (const category of categories) {
        const categoryDir = path.join(toolsDir, category);
        const files = fs.readdirSync(categoryDir).filter(file => file.endsWith('.js') && file !== 'index.js' && file !== '_utils.js');
        
        for (const file of files) {
            const toolPath = path.join(categoryDir, file);
            const toolModule = require(toolPath);
            
            if (toolModule.intentSchema) {
                registry.push(toolModule.intentSchema);
            }
        }
    }
    console.log(`[ToolRegistry] Loaded ${registry.length} tool schemas.`);
}

function getSchemas() {
    if (registry.length === 0) loadTools();
    return registry;
}

module.exports = { loadTools, getSchemas };