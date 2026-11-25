// Local service smoke test. Reads source as data; never runs inspected functions.
require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {buildRequestBody}=require('../src/models/providers/ollama');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
const {detect,createService}=require('../src/reasoning/projectQuestion');
async function main(){
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx');
 const output=path.join(root,Date.now()+'-checked-service.json');
 const report={status:'running',boundary:'Explicit checked command through actual service, local Ollama only. No production conversation, memory, workers or execution of inspected source. No independent reference execution.',runs:[]};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 let cancelled=false,controller;const poll=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller?.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const inventory=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)});
  if(!inventory.ok)throw Error('Local model inventory unavailable (HTTP '+inventory.status+').');
  report.installed=(await inventory.json()).models;
  if(!Array.isArray(report.installed))throw Error('Invalid local model inventory.');
  report.hashes={};const hash=require('../evaluation/semantic/harness').hash;
  for(const file of ['checkedPredictions','checkedReleasePolicy','checkedAnalysisResponse','deepAnalysis','projectQuestion'])report.hashes[file]=hash(await fs.readFile(path.resolve(__dirname,'../src/reasoning',file+'.js'),'utf8'));
  console.log(output);await save();
  const commands=[
   'Checked analyze src/response/recovery.js function getRecoveryAppend with existingReply set to "" and recoveredReply set to "Hello"',
   'Checked analyze src/utils/keywordExtractor.js function extractKeywords with text set to 7',
   'Checked analyze src/diagnostics/checkedAnalysisSample.js function describeValue with value set to 0'
  ];
  for(const text of commands){
   if(cancelled)break;controller=new AbortController();
   const row={command:text,calls:[]},started=Date.now();report.runs.push(row);await save();
   try{
    row.result=await createService({repository:{get(){throw Error('Unexpected storage access');}}}).answer(detect(text,null,'alice',Date.now(),[]),{
     agentId:'alice',isCancelled:()=>cancelled,completeEnvelope:async(messages,options)=>{
      const body=buildRequestBody(messages,options,false);body.keep_alive=0;
      const call={body};row.calls.push(call);await save();const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
      if(!report.installed.some(m=>m.name===body.model))throw Error('Requested local model is not installed');
      try{const data=await requestEnvelope(body,{timeoutMs:options.timeoutMs,signal:controller.signal});call.response=inspectResponse(data);call.metrics={generatedTokens:data.eval_count,promptTokens:data.prompt_eval_count,doneReason:data.done_reason};await save();return data;}
      finally{options.signal?.removeEventListener('abort',abort);}
     }
    });row.status='complete';
   }catch(error){row.status=cancelled?'cancelled':'failed';row.error=error.message;}
   row.elapsedMs=Date.now()-started;await save();console.log(JSON.stringify({command:text,status:row.status,release:row.result?.analysis.status,error:row.error}));
  }
  report.status=cancelled?'cancelled':'awaiting_review';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{clearInterval(poll);await save();await lock.close();await fs.unlink(lockPath);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
