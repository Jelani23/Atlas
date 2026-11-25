const assert=require('node:assert/strict'),h=require('../evaluation/semantic/harness');
const {jobs}=require('../evaluation/semantic/singleInput');
async function main(){
 const test=h.manifest.cases.find(c=>c.id==='guard-method'),e=await h.prepare(test);
 const split=jobs(test,e,'ordered-single');
 assert.equal(split.length,3);assert.equal(split.reduce((n,j)=>n+j.maxTokens,0),6000);
 for(const job of split){
  assert.equal(job.evidence.probes.length,1);
  assert(job.evidence.checks.scenarios.every(s=>job.ids.includes(s.inputId)));
  assert.deepEqual(job.request.format.properties.predictions.items.properties.inputId.enum,job.ids);
  assert.equal(job.request.format.properties.predictions.minItems,1);
  assert(job.request.messages[1].content.includes(e.packet.sources[0].source));
  assert(!JSON.stringify(job.request).includes('"expected"'));
  for(const probe of e.probes.filter(p=>!job.ids.includes(p.id)))assert(!job.request.messages[1].content.includes(probe.id+':'));
 }
 assert.match(split[1].request.messages[1].content,/lower\(7\)/);
 const answer={overview:'Numeric method call.',assumptions:[],predictions:[{inputId:'p2',outcome:{kind:'throw',type:'error',valueJson:'"TypeError"'},reason:'Numeric 7 passes the falsy guard and has no toLowerCase method.',neededEvidence:'',citations:[{path:e.packet.sources[0].path,line:3}]}]};
 assert.equal(h.inspectStructured(JSON.stringify(answer),split[1].evidence,'D').contractStatus,'valid');
 assert.equal(h.inspectStructured(JSON.stringify(answer),split[0].evidence,'D').contractStatus,'invalid');
 const multi=jobs(test,e,'ordered-multi');assert.equal(multi.length,1);assert.equal(multi[0].maxTokens,6000);
 assert.equal(multi[0].request.messages[0].content,split[0].request.messages[0].content.replace(/"minItems":1,"maxItems":1/, '"minItems":3,"maxItems":3').replace('"enum":["p1"]','"enum":["p1","p2","p3"]'));
 assert.deepEqual(jobs(test,e,'existing')[0].request,h.requestFor(e,'D'));
 assert.throws(()=>jobs(test,e,'unknown'),/mode/);
 const summarize=require('../scripts/summarizeSingleInput').summarize;
 const report={caseSet:h.manifest,caseSetHash:h.hash(h.manifest),runs:[{id:'bad',mode:'ordered-single',inputIds:['p2'],status:'complete',answer:'{}',structured:{contractStatus:'invalid'},elapsedMs:1}]};
 const summary=summarize(report).groups[2];assert.equal(summary.scoredProbes,0);assert.equal(summary.requestedProbes,1);assert.equal(summary.validContracts,0);
 assert.throws(()=>summarize(report,{runs:[{id:'bad',answerHash:'stale'}]}),/stale/);
 console.log('Single-input comparison: isolated IDs, source preservation, no reference leakage, equal aggregate budgets passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
