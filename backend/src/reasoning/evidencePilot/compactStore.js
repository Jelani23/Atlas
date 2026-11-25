const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');
async function digest(file, compressed = false) {
    const hash = crypto.createHash('sha256'); let bytes = 0;
    const sink = new Writable({ write(chunk, _encoding, done) {
        bytes += chunk.length;
        if (bytes > 256 * 1024 * 1024) return done(new Error('Evidence verification size limit exceeded.'));
        hash.update(chunk); done();
    } });
    await pipeline(fs.createReadStream(file), ...(compressed ? [zlib.createGunzip()] : []), sink);
    return { hash: hash.digest('hex'), bytes };
}
async function compactStore(root) {
    const directory = path.resolve(root, '.local/connected-evidence-test');
    const results = [];
    for (const name of (await fsp.readdir(directory)).sort()) {
        if (!/^evidence-[a-f0-9]{64}\.json$/.test(name)) continue;
        const source = path.resolve(directory, name), destination = source + '.gz';
        if (path.dirname(source) !== directory || path.dirname(destination) !== directory) throw new Error('Invalid evidence path.');
        if (!(await fsp.lstat(source)).isFile()) throw new Error('Only ordinary evidence files may be compacted.');
        const original = await digest(source);
        const tmp = destination + '.' + crypto.randomUUID() + '.tmp';
        try {
            await pipeline(fs.createReadStream(source), zlib.createGzip(), fs.createWriteStream(tmp, { flags: 'wx' }));
            if ((await digest(tmp, true)).hash !== original.hash) throw new Error('Compressed evidence verification failed.');
            // Never overwrite a different pre-existing archive.
            try { await fsp.copyFile(tmp, destination, fs.constants.COPYFILE_EXCL); }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
            if (!(await fsp.lstat(destination)).isFile() || (await digest(destination, true)).hash !== original.hash)
                throw new Error('Existing compressed evidence differs; original preserved.');
            if ((await digest(source)).hash !== original.hash) throw new Error('Evidence changed during compression; original preserved.');
            const compressedBytes = (await fsp.stat(destination)).size;
            await fsp.unlink(source); // Verified, losslessly retained at destination. No recursive deletion.
            results.push({ file: name, compressedFile: name + '.gz', sha256: original.hash, originalBytes: original.bytes, compressedBytes });
        } finally { await fsp.rm(tmp, { force: true }); }
    }
    return { status: 'complete', files: results, savedBytes: results.reduce((n, r) => n + r.originalBytes - r.compressedBytes, 0) };
}
module.exports = { compactStore };
