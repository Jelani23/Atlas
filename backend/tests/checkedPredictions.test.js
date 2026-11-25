const assert=require('node:assert/strict');
const h=require('../evaluation/semantic/harness');
const checker=require('../src/reasoning/checkedPredictions');
async function main(){
    const evidence=await h.prepare(h.manifest.cases.find(c=>c.id==='trim-pipeline'));
    const bound=checker.bindEvidence(evidence.packet,evidence.checks.scenarios,evidence.probes);
    const cite={path:evidence.packet.sources[0].path,line:4};
    const draft={overview:'Counts split elements.',assumptions:['Unmodified built-ins.'],predictions:[
        {inputId:'p1',outcome:{kind:'return',type:'number',valueJson:'0'},reason:'Empty text gives zero tokens.',neededEvidence:'',citations:[cite]},
        {inputId:'p2',outcome:{kind:'return',type:'number',valueJson:'2'},reason:'Two split elements.',neededEvidence:'',citations:[cite]}
    ]};
    const rejected=checker.parse(JSON.stringify(draft),evidence.packet,bound);
    assert.equal(rejected.predictionCheck.status,'conflict');assert.equal(rejected.released.modelInterpretation,null);
    assert.deepEqual(rejected.predictionCheck.conflicts[0].established,{kind:'return',result:{type:'number',value:'1'}});
    assert.equal(rejected.released.independentOutcomes[0].outcome.result.value,'1');
    assert.match(checker.feedback(rejected.predictionCheck),/p1/);
    draft.predictions[0].outcome.valueJson='1';
    const matched=checker.parse(JSON.stringify(draft),evidence.packet,bound);
    assert.equal(matched.predictionCheck.status,'matched');assert.equal(matched.released.explanationVerified,false);
    // Even a matched value does not promote the deliberately wrong explanation above.
    assert.equal(matched.released.status,'unverified_explanation');
    const test=h.manifest.cases.find(c=>c.id==='trim-pipeline');
    assert.equal(h.scoreTyped(test,{contractStatus:'valid',...matched}).correct,2);
    assert.equal(h.scoreTyped(test,{contractStatus:'valid',...rejected}).correct,1);
    draft.predictions[0].outcome={kind:'unknown',type:'unknown',valueJson:''};draft.predictions[0].neededEvidence='Need a runtime trace.';
    assert.equal(checker.parse(JSON.stringify(draft),evidence.packet,bound).predictionCheck.status,'conflict');
    draft.predictions[0].inputId='p2';assert.throws(()=>checker.parse(JSON.stringify(draft),evidence.packet,bound),/duplicate/);
    draft.predictions[0].inputId='p1';draft.predictions[1].citations=[{...cite,line:999}];assert.throws(()=>checker.parse(JSON.stringify(draft),evidence.packet,bound),/citation/);
    assert.throws(()=>checker.parse(JSON.stringify(draft),{...evidence.packet,cacheKey:'stale'},bound),/Stale/);
    assert.throws(()=>checker.bindEvidence(evidence.packet,[{...evidence.checks.scenarios[0],recordKey:'stale'}],evidence.probes),/source version/);
    assert.throws(()=>checker.bindEvidence(evidence.packet,[{...evidence.checks.scenarios[0],arguments:{text:'other'}}],evidence.probes),/arguments/);
    const finallyEvidence=await h.prepare(h.manifest.cases.find(c=>c.id==='finally-return'));
    const finallyBound=checker.bindEvidence(finallyEvidence.packet,finallyEvidence.checks.scenarios,finallyEvidence.probes);
    assert(finallyBound.probes[0].check.outcome);assert.equal(finallyBound.probes[1].check.outcome,null);
    assert.deepEqual(checker.normalize({kind:'throw',type:'error',valueJson:'"TypeError"'}),{kind:'throw',result:{type:'error',value:'TypeError'}});
    assert.deepEqual(checker.normalize({kind:'throw',type:'string',valueJson:'"TypeError"'}),{kind:'throw',result:{type:'string',value:'TypeError'}});
    assert.deepEqual(checker.normalize({kind:'return',type:'number',valueJson:'-0'}),{kind:'return',result:{type:'number',value:'-0'}});
    assert.throws(()=>checker.normalize({kind:'return',type:'number',valueJson:'"7"'}),/type/);
    assert.throws(()=>checker.normalize({kind:'return',type:'boolean',valueJson:'0'}),/type/);
    assert(h.requestFor(evidence,'D').messages.every(m=>!m.content.includes('independently derived whole-function')));
    assert.equal(h.inspectStructured(JSON.stringify({...draft,predictions:[]}),evidence,'D').contractStatus,'invalid');
    const {bundle}=await require('../src/reasoning/sourceBundle').buildBundle({path:evidence.packet.sources[0].path,complete:true,version:evidence.sourceHash,text:evidence.packet.sources[0].source},{read:async()=>{throw new Error('No external reads.');}});
    const inventory=require('../src/reasoning/functionBehavior').buildFunctionRecords(bundle);
    const root=inventory.records.find(r=>r.name===test.target);
    const prepare=require('../src/reasoning/checkedAnalysisInputs').prepare;
    assert.equal(prepare(bundle,root,evidence.packet,'Explain tokens.'),null);
    const live=prepare(bundle,root,evidence.packet,'Deep analyze function '+test.target+' with text set to "   "');
    assert.deepEqual(live.probes,[{id:'p1',args:['   ']}]);
    assert.deepEqual(live.evidence.probes[0].check.outcome,{kind:'return',result:{type:'number',value:'1'}});
    assert(live.request.messages.every(m=>!m.content.includes('independently derived whole-function')));
    assert.deepEqual(prepare(bundle,root,evidence.packet,'with text set to 7').probes[0].args,[7]);
    assert.deepEqual(prepare(bundle,root,evidence.packet,'with text set to "7"').probes[0].args,['7']);
    assert.throws(()=>prepare(bundle,{...root,parameters:['text','other']},evidence.packet,'with text set to 7'),/every function parameter/);
    const liveSource={path:evidence.packet.sources[0].path,complete:true,version:evidence.sourceHash,text:evidence.packet.sources[0].source};
    const service=require('../src/reasoning/deepAnalysis').createService({read:async()=>liveSource,checkedInputs:true});
    const command={filename:liveSource.path,question:'Deep analyze function '+test.target+' with text set to "   "'};
    const prediction=value=>({overview:'Counts tokens.',assumptions:[],predictions:[{inputId:'p1',outcome:{kind:'return',type:'number',valueJson:String(value)},reason:'Explains this result.',neededEvidence:'',citations:[cite]}]});
    const envelope=value=>({done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(prediction(value))}});
    let calls=0;
    const fixed=await service.answer(command,{agentId:'alice',completeEnvelope:async messages=>{
        calls++;if(calls===2)assert.match(messages.at(-1).content,/independently derived whole-function/);
        return envelope(calls===1?0:1);
    }});
    assert.equal(calls,2);assert.equal(fixed.firstPredictionCheck.status,'conflict');assert.equal(fixed.predictionCheck.status,'matched');
    assert.equal(fixed.analysis.explanationVerified,false);assert.match(fixed.reply,/no code executed/);
    calls=0;
    const withheld=await service.answer(command,{agentId:'alice',completeEnvelope:async()=>{calls++;return envelope(0);}});
    assert.equal(calls,2);assert.equal(withheld.analysis.modelInterpretation,null);assert.match(withheld.reply,/interpretation withheld/);
    assert(!withheld.reply.includes('Explains this result.'));assert(!withheld.speech.includes('Counts tokens.'));
    calls=0;
    const failed=await service.answer(command,{agentId:'alice',completeEnvelope:async()=>++calls===1?envelope(0):{...envelope(1),done_reason:'length'}});
    assert.equal(failed.correctionFailed,true);assert.equal(failed.analysis.modelInterpretation,null);
    assert.equal(failed.analysis.independentOutcomes[0].outcome.result.value,'1');
    calls=0;
    let cancelled=false;
    await assert.rejects(service.answer(command,{agentId:'alice',isCancelled:()=>cancelled,completeEnvelope:async()=>{calls++;if(calls===2)cancelled=true;return envelope(0);}}),/cancelled/);
    calls=0;let finishPending;
    const timed=require('../src/reasoning/deepAnalysis').createService({read:async()=>liveSource,checkedInputs:true,timeoutMs:20});
    const timedResult=await timed.answer(command,{agentId:'alice',completeEnvelope:async()=>++calls===1?envelope(0):new Promise(resolve=>{finishPending=resolve;})});
    assert.equal(timedResult.correctionFailed,true);assert.equal(timedResult.analysis.modelInterpretation,null);
    await assert.rejects(service.answer(command,{agentId:'alice',completeEnvelope:async()=>envelope(1)}),/already running/);
    finishPending(envelope(1));await new Promise(resolve=>setImmediate(resolve));
    assert.throws(()=>checker.independentFallback({...evidence.packet,cacheKey:'stale'},bound),/Stale/);
    assert.equal(checker.independentFallback(evidence.packet,{...bound,probes:[]}),null);
    const failures=[
        ['incomplete',async()=>({...envelope(1),done_reason:'length'})],
        ['invalid_contract',async()=>({...envelope(1),message:{role:'assistant',content:'{}'}})],
        ['channel_warning',async()=>({...envelope(1),message:{role:'assistant',content:'<think>private draft</think>'+JSON.stringify(prediction(1))}})],
        ['transport_failed',async()=>{throw new Error('Provider unavailable.');}]
    ];
    for(const [reason,completeEnvelope] of failures){
        const result=await service.answer(command,{agentId:'alice',completeEnvelope});
        assert.equal(result.modelFailure,reason);
        assert.equal(result.analysis.status,'independent_results_only');
        assert.equal(result.analysis.modelInterpretation,null);
        assert.equal(result.analysis.explanationVerified,false);
        assert.equal(result.predictionCheck.status,'not_checked');
        assert.deepEqual(result.predictionCheck.checked,[]);
        assert.equal(result.analysis.independentOutcomes[0].outcome.result.value,'1');
        assert.match(result.speech,/returns 1/);
        assert(!result.reply.includes('private draft'));assert(!result.speech.includes('Counts tokens.'));
        assert.equal(result.integrity.answer,undefined);
    }
    const emptyFallback=await service.answer({...command,question:'Deep analyze function '+test.target+' with text set to 7'},
        {agentId:'alice',completeEnvelope:failures[3][1]});
    assert.equal(emptyFallback.analysis.modelInterpretation,null);assert.equal(emptyFallback.analysis.independentOutcomes.length,0);assert.match(emptyFallback.reply,/No verified result is available/);
    const firstTimeout=await timed.answer(command,{agentId:'alice',completeEnvelope:()=>new Promise(resolve=>{finishPending=resolve;})});
    assert.equal(firstTimeout.analysis.status,'independent_results_only');
    await assert.rejects(service.answer(command,{agentId:'alice',completeEnvelope:async()=>envelope(1)}),/already running/);
    finishPending(envelope(1));await new Promise(resolve=>setImmediate(resolve));
    cancelled=false;
    await assert.rejects(service.answer(command,{agentId:'alice',isCancelled:()=>cancelled,completeEnvelope:async()=>{
        cancelled=true;throw new Error('Aborted.');
    }}),/cancelled/);
    let changed=false;
    const stale=require('../src/reasoning/deepAnalysis').createService({read:async()=>changed?{...liveSource,version:'changed'}:liveSource,checkedInputs:true});
    calls=0;
    await assert.rejects(stale.answer(command,{agentId:'alice',completeEnvelope:async()=>{if(++calls===2)changed=true;return envelope(calls===1?0:1);}}),/changed/);
    changed=false;
    await assert.rejects(stale.answer(command,{agentId:'alice',completeEnvelope:async()=>{
        changed=true;throw new Error('Provider unavailable.');
    }}),/changed/);
    console.log('Checked predictions: bound inputs, source versions, exact whole outcomes, conservative withholding and unsupported paths passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
