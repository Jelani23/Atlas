// Bounded local comparison; no production imports or state writes.
const fs=require('node:fs/promises'),path=require('node:path');
const h=require('../evaluation/semantic/harness'),{jobs}=require('../evaluation/semantic/singleInput');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
async function run(){
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx');
 const output=path.join(root,Date.now()+'-single-input-development.json');
 const report={version:1,status:'running',model:'qwen2.5-coder:7b',caseSet:h.manifest,caseSetHash:h.hash(h.manifest),runs:[],cases:[],
  policy:{temperature:0,seed:42,context:8192,totalOutputBudgetPerCaseAndMode:6000,timeoutMsPerCaseAndMode:180000,thinking:false,corrections:0},
  boundary:'Development-only three-way comparison. Existing versus ordered multi-input versus ordered single-input. Same total maximum output budget per case/mode; repeated source incurs extra input tokens. No correction calls in any mode. No private thinking retained. Prose requires separate review.'};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 let cancelled=false,controller;const poll=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller?.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const tags=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  report.installedModel=tags.models.find(m=>m.name===report.model);if(!report.installedModel)throw new Error('Local model not installed.');
  report.implementationHashes={};for(const f of ['scripts/evaluateSingleInput.js','evaluation/semantic/singleInput.js','evaluation/semantic/harness.js','src/reasoning/checkedPredictions.js'])report.implementationHashes[f]=h.hash(await fs.readFile(path.resolve(__dirname,'..',f),'utf8'));
  for(const id of ['guard-method','descending-bound','trim-pipeline'])report.cases.push({id,evidence:await h.prepare(h.manifest.cases.find(c=>c.id===id))});
  await save();console.log(output);let failures=0;
  for(const [index,entry] of report.cases.entries()){
   const test=h.manifest.cases.find(c=>c.id===entry.id),modes=['existing','ordered-multi','ordered-single'];
   for(const mode of [...modes.slice(index),...modes.slice(0,index)]){
    const deadline=Date.now()+180000;
    for(const job of jobs(test,entry.evidence,mode)){
     if(cancelled||failures>=2)break;
     const row={id:[entry.id,mode,...job.ids].join('/'),case:entry.id,mode,inputIds:job.ids,messages:job.request.messages,format:job.request.format,maxTokens:job.maxTokens,status:'running'};
     report.runs.push(row);await save();controller=new AbortController();const start=Date.now();
     try{
      if(deadline<=start)throw new Error('Aggregate case/mode timeout.');
      const data=await requestEnvelope({model:report.model,messages:row.messages,format:row.format,stream:false,think:false,keep_alive:0,options:{temperature:0,seed:42,num_ctx:8192,num_predict:job.maxTokens}},{timeoutMs:deadline-start,signal:controller.signal});
      Object.assign(row,inspectResponse(data));row.metrics={promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count,doneReason:data.done_reason};
      if(row.status==='complete'&&!row.warnings.length){row.structured=h.inspectStructured(row.answer,job.evidence,'D');row.score=h.scoreTyped({...test,probes:test.probes.filter(p=>job.ids.includes(p.id))},row.structured);}
      failures=row.status==='complete'?0:failures+1;
     }catch(e){row.status=cancelled?'cancelled':'failed';row.error=e.message;failures++;}
     row.elapsedMs=Date.now()-start;await save();console.log(JSON.stringify({id:row.id,status:row.status,score:row.score?.correct,total:row.score?.total}));
    }
   }
  }
  report.status=cancelled?'cancelled':failures>=2?'stopped_completion_failures':'awaiting_review';
 }catch(e){report.status='failed';report.error=e.message;throw e;}
 finally{clearInterval(poll);await save();await lock.close();await fs.unlink(lockPath);}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
