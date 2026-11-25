// Actual service policies on an authored fixture, with all storage replaced.
require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path'),h=require('../evaluation/semantic/harness');
const {buildRequestBody}=require('../src/models/providers/ollama');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
async function run(){
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx');
 const output=path.join(root,Date.now()+'-native-service-audit.json'),report={version:1,status:'running',runs:[],boundary:'Actual source-question and deep-analysis service policies, authored fixture and empty in-memory repository. No conversation engine, UI, background workers or production storage. Only residency changed to unload after each request.'};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 let controller,cancelled=false;const poll=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller?.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const e=await h.prepare(h.manifest.cases.find(c=>c.id==='guard-method'));report.evidence=e;
  const s=e.packet.sources[0],read=async name=>{if(name!==s.path)throw new Error('Unexpected source read');return {path:s.path,text:s.source,version:s.version,complete:true};};
  console.log(output);await save();
  for(const deep of [false,true]){
   if(cancelled)break;
   const row={id:deep?'deepAnalysis':'sourceQuestion',status:'running'};report.runs.push(row);const start=Date.now();controller=new AbortController();
   const completeEnvelope=async(messages,options)=>{
    const body=buildRequestBody(messages,options,false);body.keep_alive=0;row.body=body;await save();
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
    try{const data=await requestEnvelope(body,{signal:controller.signal,timeoutMs:options.timeoutMs||45000});
     row.response=inspectResponse(data);row.metrics={promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count,doneReason:data.done_reason};await save();return data;
    }finally{options.signal?.removeEventListener('abort',abort);}
   };
   try{row.result=await require('../src/reasoning/projectQuestion').createService({read,repository:{get:async()=>null}}).answer({filename:s.path,question:e.question,targetSymbol:e.plan.target,deepAnalysis:deep},{agentId:'alice',isCancelled:()=>cancelled,completeEnvelope,complete:async(m,o)=>(await completeEnvelope(m,o)).message.content});row.status='complete';}
   catch(error){row.status=cancelled?'cancelled':'rejected';row.error=error.message;}
   row.elapsedMs=Date.now()-start;await save();console.log(JSON.stringify({id:row.id,status:row.status,error:row.error}));
  }
  report.status=cancelled?'cancelled':'awaiting_review';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{clearInterval(poll);await save();await lock.close();await fs.unlink(lockPath);}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
