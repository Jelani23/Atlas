const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

async function main() {
    const filename = require.resolve('../src/core/projectCache');
    const root = path.resolve(path.dirname(filename), '../../');
    let contents = '// filler\n'.repeat(450) + 'const lateEvidence = true;\n';
    const fakeFs = {
        readdirSync: () => [{ name: 'example.js', isDirectory: () => false }],
        readFileSync: file => {
            assert.equal(path.resolve(file), path.join(root, 'src/example.js'));
            return contents;
        },
        existsSync: file => path.resolve(file) === path.join(root, 'src/example.js')
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, __dirname: path.dirname(filename), console,
        require: name => name === 'fs' ? fakeFs : require(name)
    });
    const cache = module.exports;
    await cache.initialize();
    assert.equal(cache.getChangedFiles().length, 0, 'Full-file hashes must match immediately after initialization');
    assert.equal(cache.getFileHash('src/example.js'), crypto.createHash('md5').update(contents).digest('hex'));
    assert.match(cache.getFile('src/example.js'), /preview truncated/);
    assert(!cache.getFile('src/example.js').includes('lateEvidence'));
    assert.equal(cache.getFile('src/example.js', { full: true }), contents);
    require.cache[filename] = { id: filename, filename, loaded: true, exports: cache };
    const search = require('../src/tools/files/searchCode');
    assert.match(await search.execute('lateEvidence'), /src\/example.js \(Line 451\): const lateEvidence = true/);
    contents += 'const changedTail = true;\n';
    assert.equal(cache.getChangedFiles().length, 1);
    assert.match(await search.execute('changedTail'), /Line 452/);
    assert.equal(cache.getChangedFiles().length, 0, 'A refreshed cache uses the new full-file hash');
    assert.match(await search.execute('missingEvidence'), /No occurrences/);
    console.log('Code inspection: full-source search, bounded previews, exact line evidence and full-content hashes passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
