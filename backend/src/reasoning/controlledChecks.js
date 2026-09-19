const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
// Developer-maintained, offline regression contracts. Neither model output nor
// user text can supply executable code, a command, or a test filename.
const CONTRACTS = Object.freeze({
    'src/core/sourceReader.js': ['sourceReader.test.js', 'Range bounds, source versions, path containment and incomplete lines'],
    'src/core/codeEvidence.js': ['codeEvidence.test.js', 'Tool provenance, agent/session isolation and evidence expiry'],
    'src/reasoning/sourceInspection.js': ['sourceInspection.test.js', 'Bounded reads, version consistency, cancellation and read-only calls'],
    'src/reasoning/validatedAnalysis.js': ['validatedAnalysis.test.js', 'Citation validation, parser-only checks and review boundaries']
});
const checkRequest = message => (message || '').trim().match(/^(?:analyze|review) and test code for ([a-zA-Z0-9_./\\-]+)\s*[.!?]?$/i);
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename, 'utf8')).digest('hex');
function requireRegularPath(filename) {
    const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (normalize(fs.realpathSync(filename)) !== normalize(path.resolve(filename)) || !fs.statSync(filename).isFile()) {
        throw new Error('Redirected or non-regular check path.');
    }
}

function launch(testFile, isCancelled) {
    return new Promise(resolve => {
        const env = {};
        for (const key of ['SystemRoot','WINDIR','TEMP','TMP','PATH']) if (process.env[key]) env[key] = process.env[key];
        const script = "globalThis.fetch = async () => { throw new Error('Network disabled in controlled checks'); }; require(process.argv[1]);";
        let cancelled = false;
        const child = execFile(process.execPath, ['-e', script, path.join(ROOT, 'tests', testFile)],
            {cwd:ROOT, env, shell:false, windowsHide:true, timeout:15000, maxBuffer:64000}, error => {
                clearInterval(timer);
                resolve({status:cancelled ? 'cancelled' : !error ? 'passed' : error.killed ? 'timed_out' : 'failed',
                    exitCode:typeof error?.code === 'number' ? error.code : error ? null : 0});
            });
        const timer = setInterval(() => { if (isCancelled()) { cancelled = true; child.kill(); } }, 100);
    });
}

async function runControlledChecks(files, {authorized = false, isCancelled = () => false, permission, launchCheck = launch} = {}) {
    if (!authorized) return [];
    const decision = permission || require('../permissions/permissionManager').check('runTests');
    if (!decision.allowed || decision.requiresApproval) return [{status:'skipped', detail:'Test permission unavailable; no controlled checks ran.'}];
    const results = [];
    for (const file of [...files.values()].slice(0, 3)) {
        if (isCancelled()) throw new Error('Analysis cancelled before controlled checks.');
        const contract = CONTRACTS[file.path];
        if (!contract) { results.push({path:file.path,status:'skipped',detail:'No approved behavioral check for this source file.'}); continue; }
        const target = path.join(ROOT, file.path);
        try {
            requireRegularPath(target);
            if (hash(target) !== file.version) {
                results.push({path:file.path,status:'stale',detail:'Source changed since inspection; no check ran.'}); continue;
            }
            const testPath = path.join(ROOT, 'tests', contract[0]);
            requireRegularPath(testPath);
            const testVersion = hash(testPath);
            const result = await launchCheck(contract[0], isCancelled);
            if (isCancelled() || result.status === 'cancelled') throw new Error('Analysis cancelled during controlled checks.');
            if (hash(target) !== file.version || hash(testPath) !== testVersion) {
                results.push({path:file.path,status:'stale',detail:'Source or test changed during execution; result discarded.'}); continue;
            }
            results.push({path:file.path, version:file.version, test:contract[0], testVersion,
                ...result, detail:contract[1] + '. This is an existing regression contract, not a test of a proposed patch.'});
        } catch (error) {
            if (/cancelled/.test(error.message)) throw error;
            results.push({path:file.path,status:'unavailable',detail:'The approved check could not be completed.'});
        }
    }
    return results;
}
module.exports = {runControlledChecks, checkRequest};
