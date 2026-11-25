const assert=require('node:assert/strict'),h=require('../evaluation/semantic/harness'),c=require('../evaluation/semantic/conditionClaims');
async function main(){
 const e=await h.prepare(h.manifest.cases.find(t=>t.id==='guard-method')),b=await c.prepare(e),r=c.request(e,b);
 assert.equal(b.facts.length,3);assert.equal(b.facts.find(f=>f.inputId==='p2').selectedBranch,'fallthrough');
 assert(!r.messages[1].content.includes('"conditionValue"'));assert(!r.messages[1].content.includes('"expected"'));
 const example=c.request(e,b,{errorEncodingExample:true});assert.deepEqual(example.format,r.format);assert.deepEqual(example.messages[1],r.messages[1]);assert(example.messages[0].content.startsWith(r.messages[0].content));assert(example.messages[0].content.includes(JSON.stringify({kind:'throw',type:'error',valueJson:JSON.stringify('RangeError')})));
 const answer={overview:'Test explanation remains unchecked.',assumptions:[],predictions:e.probes.map(p=>({inputId:p.id,outcome:{kind:'return',type:'string',valueJson:JSON.stringify(p.id==='p3'?'boat':'absent')},reason:'Unverified.',neededEvidence:'',citations:[{path:e.packet.sources[0].path,line:2}]})),conditionClaims:b.facts.map(f=>({factId:f.id,conditionValue:f.conditionValue,selectedBranch:f.selectedBranch}))};
 const matched=c.inspect(JSON.stringify(answer),e,b);assert.equal(matched.conditionCheck.status,'matched');assert.equal(matched.released.explanationVerified,false);
 const invalid=JSON.parse(JSON.stringify(answer));invalid.predictions[1].outcome={kind:'throw',type:'error',valueJson:'TypeError'};
 const separated=c.inspect(JSON.stringify(invalid),e,b);assert.equal(separated.contractStatus,'invalid');assert.equal(separated.conditionCheck.status,'matched');assert.equal(separated.released.modelInterpretation,null);
 // Correct conditions must not certify the deliberately wrong numeric outcome.
 assert.equal(h.scoreTyped(h.manifest.cases.find(t=>t.id==='guard-method'),matched).correct,2);
 answer.conditionClaims[1].selectedBranch='else';
 assert.equal(c.inspect(JSON.stringify(answer),e,b).conditionCheck.status,'conflict');
 answer.conditionClaims[1].conditionValue=true;answer.conditionClaims[1].selectedBranch='then';
 const bad=c.inspect(JSON.stringify(answer),e,b);assert.equal(bad.conditionCheck.status,'conflict');assert.equal(bad.released.modelInterpretation,null);assert.match(c.feedback(bad),/conditional/);
 assert.throws(()=>c.inspect(JSON.stringify(answer),{...e,probes:[{id:'p1',args:[9]}]},b),/Stale/);
 assert.throws(()=>c.request({...e,packet:{...e.packet,cacheKey:'stale'}},b),/Stale/);
 answer.conditionClaims[1]=answer.conditionClaims[0];assert.throws(()=>c.inspect(JSON.stringify(answer),e,b),/duplicate/);
 answer.conditionClaims=[];assert.throws(()=>c.inspect(JSON.stringify(answer),e,b),/required/);
 await assert.rejects(c.prepare(await h.prepare(h.manifest.cases.find(t=>t.id==='trim-pipeline'))),/No supported/);
 const ue=await h.prepare(h.manifest.cases.find(t=>t.id==='trim-pipeline')),ub=await c.prepare(ue,{allowUnsupported:true});
 assert.equal(ub.facts.length,0);assert.deepEqual(c.request(ue,ub),h.requestFor(ue,'D'));
 const ua={overview:'Unverified.',assumptions:[],predictions:ue.probes.map(p=>({inputId:p.id,outcome:{kind:'return',type:'string',valueJson:JSON.stringify('deliberately wrong')},reason:'Unsupported source interpretation.',neededEvidence:'',citations:[{path:ue.packet.sources[0].path,line:2}]}))};
 const uc=c.inspect(JSON.stringify(ua),ue,ub);assert.equal(uc.contractStatus,'valid');assert.equal(uc.conditionCheck.status,'not_supported');assert.equal(uc.released.explanationVerified,false);assert.equal(c.feedback(uc),null);
 const ui=c.inspect('{}',ue,ub);assert.equal(ui.contractStatus,'invalid');assert.equal(ui.released.modelInterpretation,null);
 assert.throws(()=>c.inspect(JSON.stringify(ua),{...ue,probes:[]},ub),/Stale/);
 const mt=h.manifest.cases.find(t=>t.id==='missing-helper'),me=await h.prepare(mt),mb=await c.prepare(me,{allowUnsupported:true});
 const mr=c.request(me,mb,{errorEncodingExample:true}),br=c.request(me,mb,{errorEncodingExample:true,sourceBoundaryRule:true});
 assert.deepEqual(br.format,mr.format);assert.deepEqual(br.messages[1],mr.messages[1]);assert(br.messages[0].content.includes('Do not infer a fixed exception from omitted code alone.'));
 const ma={overview:'Dependency implementation unavailable.',assumptions:[],predictions:[{inputId:'p1',outcome:{kind:'unknown',type:'unknown',valueJson:''},reason:'The supplied source multiplies price(sku) by 2, but the dependency result is not supplied.',neededEvidence:'price implementation and result for A, assuming module loading succeeds.',citations:[{path:me.packet.sources[0].path,line:3}]}]};
 const mc=c.inspect(JSON.stringify(ma),me,mb);assert.equal(mc.contractStatus,'valid');assert.equal(mc.conditionCheck.status,'not_supported');assert.equal(h.scoreTyped(mt,mc).results[0].status,'needs_uncertainty_review');assert.equal(mc.released.explanationVerified,false);
 assert.notEqual(mc.released.modelInterpretation,null);assert.equal(mc.dependencyCheck,undefined);
 const invented=JSON.parse(JSON.stringify(ma));invented.predictions[0].outcome={kind:'throw',type:'error',valueJson:JSON.stringify('TypeError')};invented.predictions[0].neededEvidence='';
 const blocked=c.inspect(JSON.stringify(invented),me,mb);assert.equal(blocked.contractStatus,'valid');assert.equal(blocked.released.status,'withheld_unverified_dependency');assert.equal(blocked.released.modelInterpretation,null);assert.deepEqual(blocked.dependencyCheck.inputIds,['p1']);assert.equal(blocked.analysis.predictions[0].normalized.kind,'throw');
 // Independent outcomes remain available even under the conservative import policy.
 const independent={inputId:'p1',recordKey:me.packet.nodes.find(n=>n.id===me.packet.rootId).recordKey,arguments:{sku:'A'},outcome:{status:'derived',kind:'throw',result:{type:'error',value:'TypeError'}},assumptions:'Synthetic test-only independent result, not a fixture observation.'};
 const ie={...me,checks:{...me.checks,scenarios:[independent]}};
 const ic=c.inspect(JSON.stringify(invented),ie,mb);assert.equal(ic.dependencyCheck,undefined);assert.notEqual(ic.released.modelInterpretation,null);assert.equal(ic.released.independentOutcomes.length,1);
 const mixed={...ie,probes:[...ie.probes,{id:'p2',args:['B']}]},mixedBound=await c.prepare(mixed,{allowUnsupported:true});
 const mixedAnswer={...invented,predictions:[invented.predictions[0],{...invented.predictions[0],inputId:'p2'}]};
 const mixedChecked=c.inspect(JSON.stringify(mixedAnswer),mixed,mixedBound);assert.deepEqual(mixedChecked.dependencyCheck.inputIds,['p2']);assert.equal(mixedChecked.released.modelInterpretation,null);assert.equal(mixedChecked.released.independentOutcomes.length,1);assert.equal(mixedChecked.released.independentOutcomes[0].inputId,'p1');
 const noChecks={...ue,checks:{...ue.checks,scenarios:[]}};
 assert.notEqual(c.inspect(JSON.stringify(ua),noChecks,ub).released.modelInterpretation,null); // Unsupported analyzer coverage alone is not missing source.
 const ft=h.manifest.cases.find(t=>t.id==='finally-return'),fe=await h.prepare(ft),fb=await c.prepare(fe);
 assert.deepEqual(fb.facts.map(f=>[f.conditionValue,f.selectedBranch]),[[true,'then'],[false,'fallthrough']]);
 const fa={overview:'Deliberately incorrect final outcome.',assumptions:[],predictions:fe.probes.map(p=>({inputId:p.id,outcome:{kind:'return',type:'string',valueJson:JSON.stringify('first')},reason:'Pending return mistaken for final return.',neededEvidence:'',citations:[{path:fe.packet.sources[0].path,line:3}]})),conditionClaims:fb.facts.map(f=>({factId:f.id,conditionValue:f.conditionValue,selectedBranch:f.selectedBranch}))};
 const fc=c.inspect(JSON.stringify(fa),fe,fb);assert.equal(fc.conditionCheck.status,'matched');assert.equal(h.scoreTyped(ft,fc).correct,0);assert.equal(fc.released.modelInterpretation,null);assert.equal(fc.released.explanationVerified,false);
 console.log('Condition claims: bound source/inputs, hidden checks, conflict withholding, no promotion of outcomes or prose passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
