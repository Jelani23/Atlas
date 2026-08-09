// backend/src/core/projectCache.js
const fs = require('fs');
const path = require('path');

const cache = {
    fileTree: [],
    fileContents: {},
    fileMetadata: {}
};

// Systemic fix: Use __dirname to establish the backend root, then target src/
const BACKEND_ROOT = path.join(__dirname, '../../');
const SRC_PATH = path.join(__dirname, '../'); // projectCache is in src/core, so ../ is src/

async function initialize() {
    console.log('[Cache] Building project state cache...');
    
    cache.fileTree = [];
    cache.fileContents = {};
    cache.fileMetadata = {};

    const walk = (dir) => {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.forEach(f => {
            if (f.name === 'node_modules' || f.name === '.git') return;
            const fullPath = path.join(dir, f.name);
            // Make path relative to the BACKEND_ROOT so it matches tools/registry.js
            const relPath = path.relative(BACKEND_ROOT, fullPath).replace(/\\/g, '/');

            if (f.isDirectory()) {
                walk(fullPath);
            } else if (f.name.endsWith('.js') || f.name.endsWith('.json')) {
                const stats = fs.statSync(fullPath);
                cache.fileTree.push(relPath);
                cache.fileMetadata[relPath] = { mtime: stats.mtimeMs, size: stats.size };
                
                // Pre-load source code contents
                let content = fs.readFileSync(fullPath, 'utf8');
                if (content.length > 3000) content = content.substring(0, 3000) + "\n... [truncated by cache]";
                cache.fileContents[relPath] = content;
            }
        });
    };
    
    try {
        walk(SRC_PATH);
        console.log(`[Cache] Cached ${cache.fileTree.length} source files.`);
    } catch (e) {
        console.warn('[Cache] Failed to build cache:', e.message);
    }
}

function getTree() {
    return cache.fileTree;
}

function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]/g, '').replace(/\.\w+$/, '');
}

function findFile(filename) {
    const targetName = normalize(filename);
    
    // 1. Exact match
    for (const p of cache.fileTree) {
        if (normalize(path.basename(p)) === targetName) return p;
    }
    
    // 2. CamelCase/PascalCase smart resolution
    const parsed = path.parse(filename);
    const camelCaseName = parsed.name.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase()) + parsed.ext;
    const pascalCaseName = parsed.name.replace(/(^|_)([a-z])/g, (m, p1, p2) => p2.toUpperCase()) + parsed.ext;
    
    const possibleBaseNames = [path.basename(filename), camelCaseName, pascalCaseName];
    for (const p of cache.fileTree) {
        if (possibleBaseNames.includes(path.basename(p))) return p;
    }
    
    return null;
}

function getFile(relativePath) {
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
    
    // Check if we have it cached
    if (cache.fileContents[safePath]) {
        const fullPath = path.join(BACKEND_ROOT, safePath);
        try {
            const stats = fs.statSync(fullPath);
            // Verify it hasn't been modified since caching
            if (stats.mtimeMs === cache.fileMetadata[safePath].mtime) {
                return cache.fileContents[safePath];
            }
            console.log(`[Cache] File ${safePath} changed on disk. Updating cache...`);
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.length > 3000) content = content.substring(0, 3000) + "\n... [truncated]";
            cache.fileContents[safePath] = content;
            cache.fileMetadata[safePath].mtime = stats.mtimeMs;
            return content;
        } catch (e) {
            console.log(`[Cache] File ${safePath} deleted from disk.`);
            delete cache.fileContents[safePath];
            delete cache.fileMetadata[safePath];
            cache.fileTree = cache.fileTree.filter(p => p !== safePath);
            return null;
        }
    }
    
    // Fallback to disk if not in cache (e.g., a newly created file)
    const fullPath = path.join(BACKEND_ROOT, safePath);
    if (!fs.existsSync(fullPath)) return null;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.length > 3000) content = content.substring(0, 3000) + "\n... [truncated]";
    
    try {
        const stats = fs.statSync(fullPath);
        cache.fileMetadata[safePath] = { mtime: stats.mtimeMs, size: stats.size };
        cache.fileContents[safePath] = content;
        if (!cache.fileTree.includes(safePath)) cache.fileTree.push(safePath);
    } catch(e) {}
    
    return content;
}

module.exports = { initialize, getTree, findFile, getFile };