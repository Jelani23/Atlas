// Isolated request-boundary audit. Authored source fixtures only; no app/store startup.
require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path'),h=require('../evaluation/semantic/harness');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
async function capture(evidence,deep){
 const s=evidence.packet.sources[0],source={path:s.path,text:s.source,version:s.version,complete:true};
 let captured;const sentinel=new Error('AUDIT_CAPTURE_COMPLETE');
 const intercept=async(messages,options)=>{captured={messages,options:Object.fromEntries(Object.entries(options).filter(([key])=>!['signal','requestId'].includes(key)))};throw sentinel;};
 try{await require('../src/reasoning/projectQuestion').createService({read:async name=>{if(name!==s.path)throw new Error('Unexpected source read');return source;},repository:{get:async()=>null}}).answer(
  {filename:s.path,question:evidence.question,targetSymbol:evidence.plan.target,deepAnalysis:deep},
  {agentId:'alice',complete:intercept,completeEnvelope:intercept});
 }catch(error){if(error!==sentinel)throw error;}
 if(!captured)throw new Error('No model request captured.');return captured;
}
async function run(){
 const root=path.resolve(__dirname,'../.local/semantic-evaluation');await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,'active.lock'),lock=await fs.open(lockPath,'wx'),output=path.join(root,Date.now()+'-boundary-audit.json');
 const report={version:1,status:'running',model:'qwen2.5-coder:7b',runs:[],policy:{think:false,temperature:0,seed:42,num_ctx:8192,num_predict:4096,keep_alive:0},
  boundary:'Two repetitions on exposed guard-method development case. Direct source-only; typed instructions without constrained decoding; identical typed instructions with schema decoding; captured deep service request replayed under matched coder settings. Captured production options are recorded separately and are not used for matched calls. No production storage, background workers or source execution.'};
 const save=async()=>{await fs.writeFile(output+'.tmp',JSON.stringify(report,null,2));await fs.rename(output+'.tmp',output);};
 let cancelled=false,controller;const stop=setInterval(()=>{if(require('node:fs').existsSync(output+'.stop')){cancelled=true;controller?.abort();}},500);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const info=async(route,body)=>{const r=await fetch('http://127.0.0.1:11434/api/'+route,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Local inventory failed');return r.json();};
  report.provider=await info('version');report.tags=await info('tags');report.models={};
  const defaultModel=require('../src/models/modelRouter').getDefaultModel().model;
  for(const model of new Set([report.model,defaultModel])){
   if(!report.tags.models.some(m=>m.name===model))throw new Error('Requested model not installed');
   const d=await info('show',{model});report.models[model]={template:d.template,parameters:d.parameters,capabilities:d.capabilities,details:d.details,modelInfo:d.model_info};
  }
  const test=h.manifest.cases.find(c=>c.id==='guard-method'),e=await h.prepare(test);report.test=test;report.evidence=e;
  report.captures={sourceQuestion:await capture(e,false),deepAnalysis:await capture(e,true)};
  report.implementationHashes={};for(const f of ['scripts/auditAnalysisBoundary.js','src/reasoning/projectQuestion.js','src/reasoning/deepAnalysis.js','src/models/modelRouter.js','src/models/providers/ollama.js'])report.implementationHashes[f]=h.hash(await fs.readFile(path.resolve(__dirname,'..',f),'utf8'));
  const typed=h.requestFor(e,'D'),deep=report.captures.deepAnalysis;
  const variants=[{id:'direct',...h.requestFor(e,'A')},{id:'typed-unconstrained',messages:typed.messages},{id:'typed-constrained',...typed},{id:'deep-service-matched',messages:deep.messages,format:deep.options.format}];
  await save();console.log(output);let failures=0;
  for(let repeat=0;repeat<2;repeat++)for(const v of repeat?[...variants].reverse():variants){
   if(cancelled||failures>=2)break;
   const row={...v,repeat,status:'running'};report.runs.push(row);await save();controller=new AbortController();const start=Date.now();
   try{
    const data=await requestEnvelope({model:report.model,messages:v.messages,...(v.format?{format:v.format}:{}),stream:false,think:false,keep_alive:0,options:{temperature:0,seed:42,num_ctx:8192,num_predict:4096}},{timeoutMs:180000,signal:controller.signal});
    Object.assign(row,inspectResponse(data));row.metrics={promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count,doneReason:data.done_reason,loadDuration:data.load_duration,totalDuration:data.total_duration};
    if(row.status==='complete'&&!row.warnings.length){
     row.structured=h.inspectStructured(row.answer,e,v.id.startsWith('typed')?'D':v.id==='direct'?'A':'B');
     if(v.id.startsWith('typed'))row.score=h.scoreTyped(test,row.structured);
     if(v.id==='deep-service-matched'){
      const s=e.packet.sources[0];row.rendered=await require('../src/reasoning/projectQuestion').createService({read:async()=>({path:s.path,text:s.source,version:s.version,complete:true})}).answer({filename:s.path,question:e.question,targetSymbol:e.plan.target,deepAnalysis:true},{agentId:'alice',completeEnvelope:async()=>data});
     }
    }
    failures=row.status==='complete'?0:failures+1;
   }catch(error){row.error=error.message;row.status=row.status==='complete'?'rejected_by_service':cancelled?'cancelled':'failed';failures++;}
   row.elapsedMs=Date.now()-start;await save();console.log(JSON.stringify({id:row.id,repeat,status:row.status,contract:row.structured?.contractStatus,score:row.score?.correct}));
  }
  report.status=cancelled?'cancelled':failures>=2?'stopped_failures':'awaiting_review';
 }catch(error){report.status='failed';report.error=error.message;throw error;}
 finally{clearInterval(stop);await save();await lock.close();await fs.unlink(lockPath);}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={capture};
