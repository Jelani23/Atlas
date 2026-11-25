const assert=require('node:assert/strict');
const {inspectResponse}=require('../scripts/deepAnalysisResponse');
const {cases,heldOut,keywordCase,prepare}=require('../scripts/auditDeepAnalysis');
async function main(){
    const response=content=>({done:true,done_reason:'stop',message:{role:'assistant',content,thinking:'private native reasoning'}});
    for(const content of ['A complete ordinary answer.','The source contains "</think>" and "<think>" literals.']){
        const result=inspectResponse(response(content));
        assert.equal(result.answer,content);assert.equal(result.status,'complete');
        assert.equal(result.semanticStatus,'unreviewed');assert.equal(result.thinkingChars,24);
        assert(!JSON.stringify(result).includes('private native reasoning'));
    }
    assert.deepEqual(inspectResponse(response('A complete ordinary answer.')).warnings,[]);
    assert.deepEqual(inspectResponse(response('Literal </think>')).warnings,['literal_thinking_tag_in_content']);
    assert(inspectResponse(response('Let me think through this.')).warnings.includes('possible_drafting_in_content'));
    for(const data of [null,{},response(''),{...response('partial'),done:false},{...response('partial'),done_reason:'length'},
        {...response('partial'),done_reason:undefined},{...response('answer'),message:{role:'user',content:'answer'}},
        {...response('answer'),message:{role:'assistant',content:42}},
        {...response('answer'),message:{role:'assistant',content:'answer',thinking:42}},
        {...response('answer'),message:{role:'assistant',content:'answer',tool_calls:[{}]}}]){
        assert.equal(inspectResponse(data).status,'incomplete');
    }

    assert.deepEqual(cases.map(c=>c.id),['search','json']);
    assert.deepEqual(heldOut.oracle().map(r=>r.observed),['bcXYZ','ijXYZ','XYZ','done','','']);
    assert.deepEqual(keywordCase.oracle().map(r=>r.observed||r.errorName),[['test123'],['blueblue','cat','123'],['caf'],['abc123'],[],[],[],'TypeError']);
    assert.deepEqual(cases[0].oracle().map(r=>r.observed),[false,true,true,false]);
    assert.deepEqual(cases[1].oracle(),[
        {input:'{"outer":{"inner":1}}',observed:{outer:{inner:1}}},
        {input:'[1,2]',observed:null},
        {input:'{"a":1} trailing }',observed:null},
        {input:'draft </think> {"a":1} </think> {"b":2}',observed:{b:2}},
        {input:7,errorName:'TypeError'}
    ]);
    for(const c of [...cases,heldOut,keywordCase]){
        const evidence=await prepare(c);await evidence.assertCurrent();
        assert.match(evidence.packet.evidencePolicy.analyzerLimits,/do not by themselves/);
        assert(evidence.packet.nodes.every(n=>Array.isArray(n.exceptionRegions)));
        assert(evidence.packet.sources.some(s=>s.path===c.file));
        assert(!JSON.stringify(evidence.packet).includes('fixedOracle'));
        assert.equal(c.questions.length,2);
    }
    console.log('Deep audit preparation and authored reference outcomes passed without model calls.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
