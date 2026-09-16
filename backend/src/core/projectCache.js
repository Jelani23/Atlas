// backend/src/core/projectCache.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cache = {
    fileTree: [],
    fileContents: {},
    fileMetadata: {} // Now stores: { hash, size }
};

const BACKEND_ROOT = path.join(__dirname, '../../');
const SRC_PATH = path.join(__dirname, '../');

function hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

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
            const relPath = path.relative(BACKEND_ROOT, fullPath).replace(/\\/g, '/');

            if (f.isDirectory()) {
                walk(fullPath);
            } else if (f.name.endsWith('.js') || f.name.endsWith('.json')) {
                let content = fs.readFileSync(fullPath, 'utf8');
                
                cache.fileTree.push(relPath);
                cache.fileContents[relPath] = content;
                cache.fileMetadata[relPath] = { 
                    hash: hashContent(content),
                    size: content.length 
                };
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

function getFileHash(relativePath) {
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
    return cache.fileMetadata[safePath]?.hash || null;
}

function getChangedFiles() {
    const changed = [];
    for (const relPath of cache.fileTree) {
        const fullPath = path.join(BACKEND_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const currentHash = hashContent(content);
            if (currentHash !== cache.fileMetadata[relPath]?.hash) {
                changed.push(relPath);
            }
        } else {
            changed.push(`${relPath} (deleted)`);
        }
    }
    return changed;
}

function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]/g, '').replace(/\.\w+$/, '');
}

function findFile(filename) {
    const targetName = normalize(filename);
    for (const p of cache.fileTree) {
        if (normalize(path.basename(p)) === targetName) return p;
    }
    const parsed = path.parse(filename);
    const camelCaseName = parsed.name.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase()) + parsed.ext;
    const pascalCaseName = parsed.name.replace(/(^|_)([a-z])/g, (m, p1, p2) => p2.toUpperCase()) + parsed.ext;
    const possibleBaseNames = [path.basename(filename), camelCaseName, pascalCaseName];
    for (const p of cache.fileTree) {
        if (possibleBaseNames.includes(path.basename(p))) return p;
    }
    return null;
}

function getFile(relativePath, { full = false } = {}) {
    const present = content => full || content.length <= 3000 ? content
        : content.substring(0, 3000) + '\n... [preview truncated at 3000 characters; not the complete file]';
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/\\/g, '/');
    
    if (cache.fileContents[safePath]) {
        const fullPath = path.join(BACKEND_ROOT, safePath);
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const currentHash = hashContent(content);
            
            if (currentHash === cache.fileMetadata[safePath].hash) {
                return present(cache.fileContents[safePath]);
            }
            
            console.log(`[Cache] File ${safePath} changed on disk. Updating cache...`);
            let newContent = content;
            cache.fileContents[safePath] = newContent;
            cache.fileMetadata[safePath].hash = currentHash;
            cache.fileMetadata[safePath].size = content.length;
            return present(newContent);
        } catch (e) {
            console.log(`[Cache] File ${safePath} deleted from disk.`);
            delete cache.fileContents[safePath];
            delete cache.fileMetadata[safePath];
            cache.fileTree = cache.fileTree.filter(p => p !== safePath);
            return null;
        }
    }
    
    const fullPath = path.join(BACKEND_ROOT, safePath);
    if (!fs.existsSync(fullPath)) return null;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    try {
        cache.fileMetadata[safePath] = { hash: hashContent(content), size: content.length };
        cache.fileContents[safePath] = content;
        if (!cache.fileTree.includes(safePath)) cache.fileTree.push(safePath);
    } catch(e) {}
    
    return present(content);
}

module.exports = { initialize, getTree, findFile, getFile, getFileHash, getChangedFiles };
