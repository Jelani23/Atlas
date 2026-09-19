const assert = require('node:assert/strict');
const {formatRange} = require('../src/core/sourceReader');
const {sourceIndex,checkSources,validateDraft,runValidatedAnalysis} = require('../src/reasoning/validatedAnalysis');
const evidence = {path:'src/example.js',line:1,quote:'const value = 1;'};
function source(text = evidence.quote, totalLines = 1, version = 'a'.repeat(64)) {
    return formatRange({path:evidence.path,version,startLine:1,endLine:1,totalLines,complete:totalLines===1,
        nextLine:totalLines>1?2:null,clippedLine:null,text:`1: ${text}`});
}
const candidate = {claim:'Candidate',consequence:'Possible impact',evidence,proposal:'Minimal change',testInput:'Input 1',expectedResult:'Output 1'};
const suggested = {purpose:'Check initialized value',setup:'Load the fixture in isolation',input:'Inspect value after initialization',expectedResult:'value equals 1',evidence};
async function main() {
    const files = sourceIndex(source());
    assert.equal(checkSources(files)[0].status,'passed');
    assert.equal(checkSources(sourceIndex(source('const = ;')))[0].status,'failed');
    assert.equal(checkSources(sourceIndex(source('const = ;',2)))[0].status,'skipped');
    // Parsing untrusted source never executes it, even if it could exit the process.
    assert.equal(checkSources(sourceIndex(source('process.exit(99);')))[0].status,'passed');
    assert.throws(() => sourceIndex(source()+'\n'+source(evidence.quote,1,'b'.repeat(64))),/Mixed/);
    assert.equal(validateDraft({findings:[candidate]},files).findings.length,1);
    assert.equal(validateDraft({findings:[],tests:[suggested,suggested]},files).tests.length,1);
    assert.equal(validateDraft({findings:[],tests:[{...suggested,evidence:{...evidence,quote:'fabricated'}}]},files).tests.length,0);
    assert.equal(validateDraft({findings:[],tests:[{...suggested,setup:''}]},files).tests.length,0);
    const relocated=validateDraft({findings:[],tests:[{...suggested,evidence:{...evidence,line:99}}]},files).tests[0];
    assert.equal(relocated.evidence.line,1);
    assert.equal(relocated.evidence.locationResolved,true);
    const duplicateLines=new Map([[evidence.path,{lines:new Map([[1,evidence.quote],[2,evidence.quote]])}]]);
    assert.equal(validateDraft({findings:[],tests:[{...suggested,evidence:{...evidence,line:99}}]},duplicateLines).tests.length,0);
    let usefulCalls=0;
    const useful=await runValidatedAnalysis({request:'Review and suggest tests',source:source(),complete:async()=>{
        usefulCalls++;return JSON.stringify({findings:[],tests:[suggested]});
    }});
    assert.equal(usefulCalls,1,'Useful clean-code reviews must not require a second model call');
    assert.match(useful,/Suggested behavior tests/);
    assert.match(useful,/value equals 1/);
    assert.match(useful,/not run; expected outcomes are model predictions/);
    const rejectedFinding=await runValidatedAnalysis({request:'Suggest tests',source:source(),complete:async()=>JSON.stringify({
        findings:[{...candidate,evidence:{...evidence,line:99}}],tests:[suggested]})});
    assert.match(rejectedFinding,/Check initialized value/);
    let withdrawnCalls=0;
    const usefulWithdrawn=await runValidatedAnalysis({request:'Review and suggest tests',source:source(),complete:async()=>JSON.stringify(
        ++withdrawnCalls===1 ? {findings:[candidate],tests:[suggested]} : {reviews:[{id:1,verdict:'contradicted',evidence,reason:'Guard exists'}]})});
    assert.match(usefulWithdrawn,/withdrawn/);
    assert.match(usefulWithdrawn,/Check initialized value/);
    assert.equal(validateDraft({findings:[{...candidate,claim:'candidate defect, not a confirmed bug'}]},files).rejected,1);
    assert.equal(validateDraft({findings:[{...candidate,evidence:{...evidence,line:99}}]},files).rejected,1);
    assert.equal(validateDraft({findings:[{...candidate,evidence:{...evidence,quote:'invented'}}]},files).rejected,1);
    assert.equal(validateDraft({findings:[{...candidate,evidence:{...evidence,path:'src/other.js'}}]},files).rejected,1);
    let calls = [];
    async function run(verdict, override = {}) {
        calls = [];
        return runValidatedAnalysis({request:'Review',source:source(),complete:async messages => {
            calls.push(messages);
            return JSON.stringify(calls.length === 1 ? {findings:[candidate]} :
                {reviews:[{id:1,verdict,evidence,reason:'Existing source branch checked.',...override}]});
        }});
    }
    const withdrawn = await run('contradicted',{reason:'Invented explanation that must not be displayed.'});
    assert.match(withdrawn,/withdrawn/);
    assert.doesNotMatch(withdrawn,/Invented explanation/);
    assert.equal(calls.length,2);
    assert.match(await run('uncertain'),/unresolved/);
    const supported = await run('supported');
    assert.match(supported,/Unverified candidate/);
    assert.match(supported,/Proposed test \(not run\)/);
    assert.match(supported,/Model agreement is not independent verification/);
    assert.match(await run('supported',{evidence:{...evidence,line:2}}),/withheld/);
    assert.match(await run('invented-verdict'),/withheld/);
    let arrayCalls = 0;
    const arrayReview = await runValidatedAnalysis({request:'Review',source:source(),complete:async()=>JSON.stringify(
        ++arrayCalls === 1 ? {findings:[candidate]} : [{id:1,verdict:'supported',evidence,reason:'Source checked.'}])});
    assert.match(arrayReview,/Unverified candidate/);
    let checkedCalls = 0;
    const checked = await runValidatedAnalysis({request:'Review',source:source(),runChecks:true,
        checkRunner:async (_files,options) => {assert(options.authorized);return [{path:evidence.path,status:'passed',test:'fixture.test.js',detail:'Known guard contract'}];},
        complete:async messages => {
            if (++checkedCalls === 1) return JSON.stringify({findings:[candidate]});
            assert.match(messages[1].content,/ACTUAL CONTROLLED CHECK RESULTS/);
            assert.match(messages[1].content,/fixture.test.js/);
            return JSON.stringify({reviews:[{id:1,verdict:'contradicted',evidence,reason:'Known guard contract contradicts the finding.'}]});
        }});
    assert.match(checked,/withdrawn/);
    assert.match(checked,/passed \(fixture.test.js\)/);
    assert.doesNotMatch(checked,/No behavioral tests run/);
    let count = 0;
    const malformed = await runValidatedAnalysis({request:'Review',source:source(),complete:async () => {count++;return 'I ran tests and fixed everything';}});
    assert.equal(count,1);
    assert.doesNotMatch(malformed,/I ran tests/);
    assert.match(malformed,/No model findings were accepted/);
    let failingCalls=0;
    const degraded=await runValidatedAnalysis({request:'Review',source:source(),complete:async()=>{
        if (++failingCalls===1) return JSON.stringify({findings:[candidate],tests:[suggested]});
        throw new Error('provider secret details must not be displayed');
    }});
    assert.match(degraded,/review unavailable or timed out/);
    assert.match(degraded,/withheld/);
    assert.match(degraded,/Check initialized value/);
    assert.doesNotMatch(degraded,/provider secret/);
    const draftFailure=await runValidatedAnalysis({request:'Review',source:source(),runChecks:true,
        complete:async()=>{throw new Error('provider failure');},
        checkRunner:async()=>[{path:evidence.path,status:'passed',test:'fixture.test.js',detail:'Fixed check'}]});
    assert.match(draftFailure,/Draft generation unavailable/);
    assert.match(draftFailure,/passed \(fixture.test.js\)/);
    let pendingCancelled=false;
    const cancelTimer=setTimeout(()=>{pendingCancelled=true;},10);
    await assert.rejects(runValidatedAnalysis({request:'Review',source:source(),isCancelled:()=>pendingCancelled,
        complete:()=>new Promise(()=>{})}),/cancelled/);
    clearTimeout(cancelTimer);
    await assert.rejects(runValidatedAnalysis({request:'Review',source:source(),isCancelled:()=>true,complete:async()=>{throw new Error('must not call model');}}),/cancelled/);
    let cancelled = false;
    await assert.rejects(runValidatedAnalysis({request:'Review',source:source(),isCancelled:()=>cancelled,complete:async()=>{
        cancelled=true;return JSON.stringify({findings:[candidate]});
    }}),/cancelled/);
    console.log('Validated analysis: exact citations, bounded review, counterevidence, parser-only checks and fail-closed output passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
