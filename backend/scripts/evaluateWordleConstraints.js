// Isolated local diagnostic. No application imports, memory writes or answer lookup.
const fs=require('node:fs/promises'),path=require('node:path');
const {rows,history}=require('../evaluation/wordle/cases');
const checker=require('../evaluation/wordle/constraints');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
async function run(){
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');
 await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx');
 const output=path.join(root,Date.now()+'-wordle-diagnostic.json');
 const report={version:1,model:'qwen3.5:4b',status:'running',runs:[],
  boundary:'Abridged user transcript, not a production replay. Compare recent messages, full abridged history, and explicit feedback ledger. The disclosed answer is absent from prompts. Candidate consistency does not verify dictionary eligibility, explanations or a unique solution.',
  policy:{think:false,temperature:0,seed:42,num_ctx:8192,num_predict:4096,keep_alive:0},feedback:rows};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 const controller=new AbortController();let cancelled=false;
 const stop=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const tags=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  report.installedModel=tags.models.find(m=>m.name===report.model);
  if(!report.installedModel)throw new Error('Required local model is not installed.');
  const system={role:'system',content:'You are Alice, helping solve a Wordle puzzle. Propose a new five-letter English word as a possible solution consistent with all supplied feedback. The hidden answer is not known. Give a concise supporting reason, not private scratch work. Return JSON with guess and reason. An unplayed suggestion has no observed feedback.'};
  const requests=[
   {id:'recent-window',messages:[system,...history.slice(-4)]},
   {id:'full-abridged-history',messages:[system,...history]},
   {id:'explicit-ledger',messages:[system,{role:'user',content:'Played guesses and feedback: '+JSON.stringify(rows)+'\nDerived constraints (positions are one-based): '+JSON.stringify(checker.ledger(rows))+'\nGive a new candidate consistent with this evidence. FLIER was suggested but never played.'}]}
  ];
  let failures=0;console.log(output);await save();
  for(const request of requests){
   if(cancelled||failures>=2)break;
   const result={...request,startedAt:new Date().toISOString()};report.runs.push(result);await save();
   const started=Date.now();
   try{
    const data=await requestEnvelope({model:report.model,messages:request.messages,stream:false,think:false,keep_alive:0,
     format:{type:'object',additionalProperties:false,required:['guess','reason'],properties:{guess:{type:'string'},reason:{type:'string'}}},
     options:{temperature:0,seed:42,num_ctx:8192,num_predict:4096}},{timeoutMs:180000,signal:controller.signal});
    Object.assign(result,inspectResponse(data));
    result.metrics={doneReason:data.done_reason,promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count};
    if(result.status==='complete'&&!result.warnings.length){
     try{const answer=JSON.parse(result.answer);result.candidateCheck=checker.inspect(answer.guess,rows);}catch{result.contractError='Invalid JSON answer.';}
    }
    failures=result.status==='complete'?0:failures+1;
   }catch(error){result.status=cancelled?'cancelled':'failed';result.error=error.message;failures++;}
   result.elapsedMs=Date.now()-started;await save();console.log(JSON.stringify({id:result.id,status:result.status,check:result.candidateCheck}));
  }
  report.status=cancelled?'cancelled':'awaiting_review';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{clearInterval(stop);await save();await lock.close();await fs.unlink(lockPath);}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
