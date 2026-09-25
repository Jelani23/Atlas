const assert=require('node:assert/strict');
const {checkAssertions}=require('../src/reasoning/semanticConsistency');
async function main(){
    const facts=[{id:'a',kind:'expression-result',result:{type:'number',value:'-0'}},{id:'b',kind:'expression-result',result:{type:'string-array',value:['','a']}}];
    assert.equal(checkAssertions([],facts).status,'incomplete');
    assert.equal(checkAssertions([{factId:'a',resultJson:'{"type":"number","value":"0"}'}],facts).status,'rejected');
    assert.equal(checkAssertions([{factId:'a',resultJson:'{"value":"-0","type":"number"}'},{factId:'b',resultJson:JSON.stringify(facts[1].result)}],facts).status,'matched');
    assert.equal(checkAssertions([{factId:'unknown',resultJson:'null'}],facts).status,'rejected');
    assert.equal(checkAssertions([{factId:'a',resultJson:'invalid'}],facts).status,'rejected');
    const service=require('../src/reasoning/projectQuestion').createService({repository:{get:async()=>null},evidenceBundle:true});
    const answer=await service.answer({filename:'src/tools/utilities/characterCount.js',question:'Inspect "abc"',targetSymbol:'characterCount',inputBindings:[{inputId:'input0',parameter:'text'}]},{agentId:'alice',complete:async(m,o)=>{
        const id=o.format.properties.expressionAssertions.items.properties.factId.enum[0];
        return JSON.stringify({claims:[{text:'UNTRUSTED CLAIM',evidenceIds:[id]}],predictions:[],unknowns:[],expressionAssertions:[{factId:id,resultJson:'{"type":"number","value":"999"}'}]});
    }});
    assert.equal(answer.consistency.status,'rejected');
    assert.doesNotMatch(answer.reply,/UNTRUSTED CLAIM|999/);
    assert.doesNotMatch(answer.speech,/UNTRUSTED CLAIM|999/);
    assert.match(answer.reply,/Atlas-derived expression results/);
    assert(answer.staticEvidence.length);
    console.log('Structured expression consistency and deterministic-evidence preservation passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
