const assert=require('node:assert/strict');
const {analyze,buildMessages}=require('../src/reasoning/focusedAnalysis');
const {readRange}=require('../src/core/sourceReader');
const {cases,oracle}=require('./fixtures/focusedProfileCases');
async function main(){
    for(const c of cases) await oracle(c);
    const source=readRange('src/agents/agentProfiles.js',1,200);
    const args={source,symbol:'get',scenario:'A fresh store; get("alice").'};
    const messages=buildMessages(source,'get',args.scenario);
    assert.match(messages[1].content,/lines 20-49/);
    assert.match(messages[1].content,/const cache = new Map/,'Keep enclosing state');
    assert.doesNotMatch(messages[1].content,/function validateProfile/,'Exclude unrelated function bodies');
    assert.throws(()=>buildMessages(source,'missing','x'),/uniquely/);
    assert.throws(()=>buildMessages(source,'get',''),/scenario/);
    const result=await analyze({...args,complete:async()=>JSON.stringify({result:'Unknown without database/seed details.',explanation:'Database outcome not provided.',lines:[27]})});
    assert.match(result.citations[0].quote,/client.from/);
    await assert.rejects(analyze({...args,complete:async()=>JSON.stringify({result:'x',explanation:'y',lines:[999]})}),/citation/);
    await assert.rejects(analyze({...args,timeoutMs:5,complete:()=>new Promise(()=>{})}),/timed out/);
    await assert.rejects(analyze({...args,isCancelled:()=>true,complete:()=>{throw new Error('Should not call');}}),/cancelled/);
    console.log('Focused analysis: fixed behavior oracles, source context, citations, timeout and cancellation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
