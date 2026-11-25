const fs = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('./collector');

// Fixed namespace, deliberately not configurable to a production repository.
function createStore(root) {
    const directory = path.resolve(root, '.local/connected-evidence-test');
    async function read(name) {
        try { return JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    async function write(name, value) {
        await fs.mkdir(directory, { recursive: true });
        const tmp = path.join(directory, `${name}.${require('node:crypto').randomUUID()}.tmp`);
        try { await fs.writeFile(tmp, JSON.stringify(value), { flag: 'wx' }); await fs.rename(tmp, path.join(directory, name)); }
        finally { await fs.rm(tmp, { force: true }); }
    }
    return { directory, read, write,
        async importEvidence(source, version) {
            if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('Invalid evidence version.');
            await fs.mkdir(directory, { recursive: true });
            const name = `evidence-${version}.json.gz`;
            const tmp = path.join(directory, `${name}.${require('node:crypto').randomUUID()}.tmp`);
            try {
            await require('node:stream/promises').pipeline(require('node:fs').createReadStream(source),
                require('node:zlib').createGzip(), require('node:fs').createWriteStream(tmp, { flags: 'wx' }));
            const entries = (await fs.readdir(directory)).filter(n => /^evidence-[a-f0-9]{64}\.json(?:\.gz)?$/.test(n) && n !== name);
            let total = (await fs.stat(tmp)).size;
            for (const entry of entries) total += (await fs.stat(path.join(directory, entry))).size;
            if (total > 256 * 1024 * 1024) throw new Error('Isolated evidence store reached its 256 MiB snapshot limit; archive reviewed test snapshots before continuing.');
            await fs.rename(tmp, path.join(directory, name));
            return name;
            } finally { await fs.rm(tmp, { force: true }); }
        },
        async saveRecord(target, value) { await write(`${hash(target)}.json`, value); },
        async readRecord(target, version) {
            const record = await read(`${hash(target)}.json`);
            return record?.snapshotVersion === version ? record : null;
        }
    };
}
function readEvidenceSync(file) {
    let raw;
    try { raw = require('node:fs').readFileSync(file); }
    catch (error) {
        if (error.code !== 'ENOENT' || !/evidence-[a-f0-9]{64}\.json$/.test(path.basename(file))) throw error;
        file += '.gz'; raw = require('node:fs').readFileSync(file);
    }
    return JSON.parse((file.endsWith('.gz') ? require('node:zlib').gunzipSync(raw, { maxOutputLength: 256 * 1024 * 1024 }) : raw).toString('utf8'));
}
module.exports = { createStore, readEvidenceSync };
