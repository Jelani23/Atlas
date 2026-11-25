// Explicit local development command. Does not import the app, provider router service, or stores.
require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const h=require('../evaluation/semantic/harness');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const {inspectResponse}=require('../src/reasoning/deepAnalysisResponse');
const root=path.resolve(__dirname,'../.local/semantic-evaluation');
async function localInfo(route,body) {
    const response=await fetch('http://127.0.0.1:11434/api/'+route,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{}),signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error('Local inventory HTTP '+response.status);
    return response.json();
}
async function run() {
    const args=process.argv.slice(2),arg=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
    if(args.some(a=>!/^--(cases|models|conditions|repeats|tokens|context|thinking|label|presence|correct-from|review)=/.test(a))) throw new Error('Unknown argument.');
    const ids=arg('cases','guard-method,descending-bound,trim-pipeline').split(',');
    const cases=ids.map(id=>h.manifest.cases.find(c=>c.id===id));
    const conditions=arg('conditions','A,B').split(',');
    const repeats=Number(arg('repeats','1')),tokens=Number(arg('tokens','4096'));
    const context=Number(arg('context','16384'));
    if(![4096,8192,16384].includes(context))throw new Error('Use a bounded context size: 4096, 8192 or 16384.');
    const thinking=arg('thinking','auto');
    if(!['auto','off'].includes(thinking))throw new Error('Use automatic thinking capability detection or explicit off.');
    const presenceArg=arg('presence','native'),presence=presenceArg==='native'?undefined:Number(presenceArg);
    if(presence!==undefined&&(!Number.isFinite(presence)||presence<0||presence>2))throw new Error('Invalid presence penalty.');
    if(!cases.length||cases.length>6||cases.some(c=>!c)||new Set(ids).size!==ids.length||conditions.some(c=>!['A','B','C','D','E'].includes(c))||new Set(conditions).size!==conditions.length||!Number.isInteger(repeats)||repeats<1||repeats>2||!Number.isInteger(tokens)||tokens<1024||tokens>12000) throw new Error('Invalid bounded evaluation selection.');
    const configured=require('../src/models/modelRouter').getDefaultModel().model;
    const models=arg('models',configured+',qwen2.5-coder:7b').split(',');
    if(models.length>3||new Set(models).size!==models.length) throw new Error('Use one to three distinct installed models.');
    const label=arg('label','stage');if(!/^[a-z0-9-]{1,50}$/.test(label)) throw new Error('Invalid label.');
    const correctionPath=arg('correct-from',null),reviewPath=arg('review',null);
    if(Boolean(correctionPath)!==Boolean(reviewPath)||correctionPath&&(conditions.join(',')!=='C'||repeats!==1))throw new Error('Correction requires a report and review, C only, and one attempt.');
    const priorReport=correctionPath?JSON.parse(await fs.readFile(correctionPath,'utf8')):null;
    const priorReviews=reviewPath?JSON.parse(await fs.readFile(reviewPath,'utf8')):null;
    if(priorReport)require('./summarizeSemanticEvaluation').summarize(priorReport,priorReviews);
    await fs.mkdir(root,{recursive:true});
    const lockPath=path.join(root,'active.lock');
    const lock=await fs.open(lockPath,'wx');
    const output=path.join(root,Date.now()+'-'+label+'.json');
    const report={version:1,startedAt:new Date().toISOString(),command:args,configuredModel:configured,caseSetHash:h.hash(h.manifest),caseSet:h.manifest,
        policy:{temperature:0,presence_penalty:presence??'model_default',num_predict:tokens,num_ctx:context,thinking,timeoutMs:tokens>4096?600000:180000,seed:42,keep_alive:0},
        boundary:'Isolated local evaluation. No production state writes. A/B use identical complete source, questions and generation budgets. B adds the existing source view and contract. Thinking support differs by model. C is an experimental bounded-check condition. Scores require separate review.',
        cases:[],runs:[],skipped:[],status:'running'};
    const save=async()=>{const temp=output+'.tmp';await fs.writeFile(temp,JSON.stringify(report,null,2));await fs.rename(temp,output);};
    let cancelled=false,activeController;
    const cancel=()=>{cancelled=true;activeController?.abort();};
    process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    // Windows pipe-backed sessions cannot always deliver SIGINT. A report-specific
    // stop file gives the caller a checkpoint-preserving cancellation path.
    const stopPath=output+'.stop';
    const stopPoll=setInterval(()=>{if(require('node:fs').existsSync(stopPath))cancel();},500);
    try {
        await lock.writeFile(JSON.stringify({pid:process.pid,output}));
        report.implementationHashes={};
        for(const file of ['scripts/evaluateSemanticAnalysis.js','evaluation/semantic/harness.js','src/reasoning/deepAnalysisContract.js','src/reasoning/primitiveSemantics.js','src/reasoning/functionScenario.js','src/reasoning/checkedPredictions.js'])report.implementationHashes[file]=h.hash(await fs.readFile(path.resolve(__dirname,'..',file),'utf8'));
        const tags=await localInfo('tags');report.provider=await localInfo('version');
        report.hardware={totalMemory:os.totalmem(),freeMemory:os.freemem(),cpu:os.cpus()[0]?.model};
        try{report.hardware.gpu=execFileSync('nvidia-smi',['--query-gpu=name,memory.total,memory.free','--format=csv'],{encoding:'utf8',windowsHide:true}).trim();}catch{report.hardware.gpu='unavailable';}
        report.installedModels=tags.models.map(m=>({name:m.name,digest:m.digest,size:m.size,details:m.details}));
        report.models=[];
        for(const model of models) {
            const installed=tags.models.find(m=>m.name===model);if(!installed) throw new Error('Requested model is not installed: '+model);
            const detail=await localInfo('show',{model});
            report.models.push({...installed,capabilities:detail.capabilities,parameters:detail.parameters,templateHash:h.hash(detail.template||''),modelInfo:detail.model_info,think:thinking==='auto'&&(detail.capabilities?.includes('thinking')||false)});
        }
        // Freeze evidence before the first call. Expected outcomes stay outside messages.
        for(const test of cases) report.cases.push({id:test.id,split:test.split,evidence:await h.prepare(test)});
        await save(); console.log(JSON.stringify({output,stopPath,models,cases:ids,conditions,repeats}));
        const consecutiveFailures=new Map(),conditionFailures=new Map();
        for(const model of report.models) for(let repeat=0;repeat<repeats;repeat++) for(const entry of report.cases) for(const condition of repeat%2?[...conditions].reverse():conditions) {
            if(cancelled) break;
            const conditionKey=model.name+'/'+condition;
            if((consecutiveFailures.get(model.name)||0)>=2||(conditionFailures.get(conditionKey)||0)>=2){report.skipped.push({model:model.name,case:entry.id,condition,repeat,reason:'Two consecutive incomplete or failed calls for this model or condition; stage stopped.'});await save();continue;}
            const request=h.requestFor(entry.evidence,condition);
            const row={id:`${model.name}/${entry.id}/${condition}/${repeat}`,model:model.name,case:entry.id,condition,repeat,think:model.think,messages:request.messages,format:request.format,status:'running',startedAt:new Date().toISOString()};
            if(priorReport){
                const prior=priorReport.runs.find(r=>r.model===model.name&&r.case===entry.id&&r.condition==='B'&&r.repeat===0);
                const review=priorReviews.runs.find(r=>r.id===prior?.id);
                const previousEvidence=priorReport.cases.find(c=>c.id===entry.id)?.evidence;
                if(!prior||prior.status!=='complete'||!review||previousEvidence?.sourceHash!==entry.evidence.sourceHash)throw new Error('Correction requires a reviewed complete B answer and unchanged source.');
                const test=cases.find(c=>c.id===entry.id),scored=h.score(test,review);
                const mismatches=scored.exactOutcomes.results.filter(r=>!r.correct).map(r=>r.id);
                const supported=entry.evidence.checks.scenarios.filter(s=>mismatches.includes(s.inputId)&&s.outcome.status==='derived');
                if(!supported.length)throw new Error('No independently derived whole-function result supports this correction.');
                const feedback='The previous answer conflicts with these independently derived whole-function results for the same inputs: '+JSON.stringify(supported)+'. Correct those outcomes and dependent explanations using the supplied checks. Keep useful unsupported interpretations explicitly unverified. This is one bounded correction attempt.';
                row.correctionFrom={report:correctionPath,id:prior.id,answerHash:h.hash(prior.attempts.at(-1).answer),supported};
                request.messages.push({role:'assistant',content:prior.attempts.at(-1).answer},{role:'user',content:feedback});
            }
            report.runs.push(row);await save();
            console.log(JSON.stringify({id:row.id,status:row.status}));
            const rowStarted=Date.now();
            const controller=new AbortController();activeController=controller;
            try {
                const call=async messages=>{
                    const started=Date.now();
                    const data=await requestEnvelope({model:model.name,messages,stream:false,...(model.capabilities?.includes('thinking')?{think:model.think}:{}),...(request.format?{format:request.format}:{}),keep_alive:0,
                        options:{temperature:0,...(presence===undefined?{}:{presence_penalty:presence}),num_predict:tokens,num_ctx:context,seed:42}}, {signal:controller.signal,timeoutMs:report.policy.timeoutMs});
                    const inspected=inspectResponse(data);
                    return {...inspected,elapsedMs:Date.now()-started,metrics:{done:data.done,doneReason:data.done_reason,promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count,totalDuration:data.total_duration,loadDuration:data.load_duration},
                        structured:inspected.status==='complete'?h.inspectStructured(inspected.answer,entry.evidence,condition):null};
                };
                row.attempts=[await call(request.messages)];await save();
                const first=row.attempts[0];
                if(['D','E'].includes(condition)&&first.status==='complete'&&first.structured?.predictionCheck?.conflicts.length){
                    const feedback=require('../src/reasoning/checkedPredictions').feedback(first.structured.predictionCheck);
                    row.correctionFeedback=feedback;await save();
                    row.attempts.push(await call([...request.messages,{role:'assistant',content:first.answer},{role:'user',content:feedback}]));
                }
                if(!priorReport&&condition==='C'&&first.status==='complete'&&first.structured?.assertionCheck?.status!=='matched'&&first.structured?.assertionCheck) {
                    const feedback='Your structured expression assertions do not match these independently derived results: '+JSON.stringify({issues:first.structured.assertionCheck.issues,facts:entry.evidence.checks.facts})+'. Correct the conflicting assertions and dependent claims once. Keep unsupported interpretations explicitly unverified.';
                    row.correctionFeedback=feedback;await save();
                    row.attempts.push(await call([...request.messages,{role:'assistant',content:first.answer},{role:'user',content:feedback}]));
                }
                row.status=row.attempts.at(-1).status;
                if(['D','E'].includes(condition))for(const attempt of row.attempts)attempt.offlineOutcomeScore=h.scoreTyped(cases.find(c=>c.id===entry.id),attempt.structured);
            } catch(error) {row.status=cancelled?'cancelled':'transport_failed';row.error={code:error.code,message:error.message};}
            finally{activeController=null;row.elapsedMs=Date.now()-rowStarted;row.finishedAt=new Date().toISOString();await save();}
            consecutiveFailures.set(model.name,row.status==='complete'?0:(consecutiveFailures.get(model.name)||0)+1);
            conditionFailures.set(conditionKey,row.status==='complete'?0:(conditionFailures.get(conditionKey)||0)+1);
            console.log(JSON.stringify({id:row.id,status:row.status,elapsedMs:row.attempts?.at(-1)?.elapsedMs,contract:row.attempts?.at(-1)?.structured?.contractStatus}));
        }
        report.status=cancelled?'cancelled':'awaiting_semantic_review';
    } catch(error) {report.status='failed';report.error=error.message;throw error;}
    finally {clearInterval(stopPoll);report.finishedAt=new Date().toISOString();await save();await lock.close();await fs.unlink(lockPath);process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
    console.log(output);
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
