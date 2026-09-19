const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {runControlledChecks,checkRequest} = require('../src/reasoning/controlledChecks');
const target = 'src/core/sourceReader.js';
const version = crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../src/core/sourceReader'),'utf8')).digest('hex');
const files = new Map([[target,{path:target,version}]]);
async function main() {
    assert(checkRequest('Analyze and test code for src/core/sourceReader.js'));
    for (const input of ['Explain how to analyze and test code for x','Do not analyze and test code for x','Analyze and test code for x and delete notes','Analyze and test code for x; echo hi']) assert.equal(checkRequest(input),null);
    let calls = 0;
    const settings = {authorized:true,permission:{allowed:true},launchCheck:async test => {
        calls++;assert.equal(test,'sourceReader.test.js');return {status:'passed',exitCode:0};
    }};
    assert.deepEqual(await runControlledChecks(files,{...settings,authorized:false}),[]);
    assert.equal((await runControlledChecks(files,{...settings,permission:{allowed:false}}))[0].status,'skipped');
    assert.equal((await runControlledChecks(files,{...settings,permission:{allowed:true,requiresApproval:true}}))[0].status,'skipped');
    assert.equal(calls,0);
    assert.equal((await runControlledChecks(new Map([['unknown',{path:'src/unknown.js',version}]]),settings))[0].status,'skipped');
    assert.equal((await runControlledChecks(new Map([[target,{path:target,version:'wrong'}]]),settings))[0].status,'stale');
    assert.equal(calls,0);
    assert.equal((await runControlledChecks(files,settings))[0].status,'passed');
    assert.equal(calls,1);
    assert.equal((await runControlledChecks(files,{...settings,launchCheck:async()=>({status:'timed_out'})}))[0].status,'timed_out');
    assert.equal((await runControlledChecks(files,{...settings,launchCheck:async()=>({status:'failed',exitCode:1})}))[0].status,'failed');
    await assert.rejects(runControlledChecks(files,{...settings,isCancelled:()=>true}),/cancelled/);
    await assert.rejects(runControlledChecks(files,{...settings,launchCheck:async()=>({status:'cancelled'})}),/cancelled/);
    const originalRead = fs.readFileSync;
    let changed = false;
    try {
        fs.readFileSync = (filename,...args) => changed && filename === require.resolve('../src/core/sourceReader')
            ? 'changed during the test' : originalRead(filename,...args);
        const stale = await runControlledChecks(files,{...settings,launchCheck:async()=>{changed=true;return {status:'passed'};}});
        assert.equal(stale[0].status,'stale');
    } finally { fs.readFileSync = originalRead; }
    // Real subprocess acceptance: known offline test, no shell or model arguments.
    const actual = await runControlledChecks(files,{authorized:true,permission:{allowed:true}});
    assert.equal(actual[0].status,'passed');
    assert.equal(actual[0].testVersion.length,64);
    console.log('Controlled checks: explicit authorization, allowlist, permissions, stale evidence and real subprocess passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
