// Isolated development experiment, using existing bounded static rules only.
const fs=require('node:fs/promises'),path=require('node:path'),h=require('../evaluation/semantic/harness'),claims=require('../evaluation/semantic/conditionClaims');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
async function run(){
 const args=process.argv.slice(2),broader=args.includes('--broader-regression'),missing=args.includes('--missing-dependency-regression');
 const modes=['--general-regression','--broader-regression','--missing-dependency-regression'];
 const regression=args.some(a=>modes.includes(a));
 if(args.some(a=>![...modes,'--error-encoding-example','--no-thinking','--source-boundary-rule'].includes(a))||new Set(args).size!==args.length||args.filter(a=>modes.includes(a)).length>1||args.includes('--error-encoding-example')&&!regression||args.includes('--no-thinking')&&!broader||args.includes('--source-boundary-rule')&&!missing)throw new Error('Use one regression mode; --no-thinking requires broader regression and --source-boundary-rule requires missing dependency regression.');
 const caseIds=missing?['missing-helper']:broader?['trim-pipeline','descending-bound','caller-normalizes','missing-helper']:regression?['guard-method','finally-return']:['guard-method'];
 const policies=regression?[{model:'qwen3.5:4b',think:true,tokens:12000,context:16384}]:[{model:'qwen2.5-coder:7b',think:false,tokens:4096,context:8192},{model:'qwen3.5:4b',think:true,tokens:12000,context:16384}];
 if(args.includes('--no-thinking'))policies[0].think=false;
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx'),output=path.join(root,Date.now()+'-condition-claims.json');
 const report={version:1,status:'running',runs:[],boundary:'Authored development guard case. Initial prompts contain condition queries but no derived answers. One correction only on condition-claim conflict. Matching condition claims do not verify outcomes or prose. No model comparison claim: profiles differ.'};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 let controller,cancelled=false;const poll=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller?.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  report.command=args;report.cases=[];
  for(const id of caseIds){const test=h.manifest.cases.find(t=>t.id===id),e=await h.prepare(test),bound=await claims.prepare(e,{allowUnsupported:broader||missing});report.cases.push({test,evidence:e,bound,request:claims.request(e,bound,{errorEncodingExample:args.includes('--error-encoding-example'),sourceBoundaryRule:args.includes('--source-boundary-rule')})});}
  Object.assign(report,report.cases[0]);
  if(missing)report.boundary='Targeted exposed missing-helper regression selected after observed failure; no fresh held-out score. Missing-source clarification changes only system instructions. Same strict contract. No answer repair. Unknown requires manual justification review.';
  else if(broader)report.boundary='Four exposed development cases; no fresh held-out score. Unsupported condition checks use the existing typed outcome contract and are explicitly not_supported, never matched. No answers are supplied. No correction without a supported condition conflict. No controlled baseline comparison or model-improvement claim.';
  else if(regression)report.boundary+=' General regression: repeat guard-method and revisit already exposed finally-return; no fresh held-out score.';
  if(args.includes('--error-encoding-example'))report.boundary+=' Prompt-only error encoding example; same strict contract, no response repair.';
  if(args.includes('--no-thinking'))report.boundary+=' Follow-up completion comparison: thinking disabled, all other requested settings and case prompts unchanged.';
  report.implementationHashes={};for(const f of ['evaluation/semantic/conditionClaims.js','src/reasoning/primitiveSemantics.js','src/reasoning/branchConclusions.js','scripts/evaluateConditionClaims.js'])report.implementationHashes[f]=h.hash(await fs.readFile(path.resolve(__dirname,'..',f),'utf8'));
  const tags=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());report.installed=tags.models;
  await save();console.log(output);
  let incompleteCount=0;
  for(const entry of report.cases)for(const policy of policies){
   const {test,evidence:e,bound,request}=entry;
   if(incompleteCount>=2)break;
   if(cancelled)break;if(!tags.models.some(m=>m.name===policy.model))throw new Error('Model not installed');
   const row={case:test.id,policy,attempts:[]};report.runs.push(row);const deadline=Date.now()+600000;controller=new AbortController();
   const call=async messages=>{
    const start=Date.now(),attempt={messages};row.attempts.push(attempt);await save();
    try{
     const data=await requestEnvelope({model:policy.model,messages,format:request.format,think:policy.think,stream:false,keep_alive:0,options:{temperature:0,seed:42,num_ctx:policy.context,num_predict:policy.tokens}},{signal:controller.signal,timeoutMs:Math.max(1,deadline-Date.now())});
     Object.assign(attempt,inspectResponse(data));attempt.metrics={promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count,doneReason:data.done_reason};
     if(attempt.status==='complete'&&!attempt.warnings.length){try{attempt.checked=claims.inspect(attempt.answer,e,bound);attempt.score=h.scoreTyped(test,attempt.checked);}catch(error){attempt.contractError=error.message;}}
    }catch(error){attempt.status=cancelled?'cancelled':'failed';attempt.error=error.message;}
    attempt.elapsedMs=Date.now()-start;await save();console.log(JSON.stringify({model:policy.model,status:attempt.status,condition:attempt.checked?.conditionCheck.status,outcomes:attempt.score?.correct,error:attempt.contractError||attempt.checked?.error}));return attempt;
   };
   const first=await call(request.messages);
   incompleteCount=first.status==='complete'?0:incompleteCount+1;
   if(!cancelled&&first.checked?.contractStatus==='valid'&&first.checked.conditionCheck.status==='conflict'){
    row.feedback=claims.feedback(first.checked);await call([...request.messages,{role:'assistant',content:first.answer},{role:'user',content:row.feedback}]);
   }
  }
  report.status=cancelled?'cancelled':incompleteCount>=2?'stopped_incomplete':'awaiting_review';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{clearInterval(poll);await save();await lock.close();await fs.unlink(lockPath);}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
