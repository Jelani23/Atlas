// Exercise the opt-in route and real local provider without conversation/database writes.
require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path');
const {detect,createService}=require('../src/reasoning/projectQuestion');
async function main(){
    const filename='src/utils/keywordExtractor.js';
    const report={version:1,model:require('../src/models/modelRouter').getDefaultModel().model,turns:[],status:'running'};
    const output=path.resolve(__dirname,'../.local/deep-analysis-audit','preview-'+Date.now()+'.json');
    await fs.mkdir(path.dirname(output),{recursive:true});
    const save=()=>fs.writeFile(output,JSON.stringify(report,null,2));
    let prior,cancelled=false;
    const cancel=()=>{cancelled=true;};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    try{
        const service=createService({repository:{get(){throw new Error('Stored knowledge must not be consulted.');}}});
        for(const prompt of ['Deep analyze the keyword extractor file function extract keywords.','What does that function return for "blue-green blue", numeric 7, and null? Explain the decisive operation.']){
            if(cancelled)break;
            const row={prompt,status:'running'};report.turns.push(row);await save();
            const command=detect(prompt,prior,'alice',Date.now(),[filename]);
            const start=Date.now();
            try{
                const result=await service.answer(command,{agentId:'alice',isCancelled:()=>cancelled,completeEnvelope:async(messages,options)=>{
                    const data=await require('../src/models/providers/ollama').completeEnvelope(messages,options);
                    row.metrics={done:data.done,doneReason:data.done_reason,promptTokens:data.prompt_eval_count,generatedTokens:data.eval_count};
                    return data;
                }});
                row.result=result;row.status='awaiting_manual_review';
                prior={path:result.path,agentId:'alice',at:Date.now(),question:command.contextQuestion||command.question,analysisMode:true,deepAnalysis:true,targetSymbol:result.coverage.target.name};
            }catch(e){row.status='incomplete';row.error=e.message;}
            finally{row.elapsedMs=Date.now()-start;await save();}
            console.log(JSON.stringify({prompt,status:row.status,elapsedMs:row.elapsedMs,error:row.error,metrics:row.metrics}));
            if(row.status==='incomplete')break;
        }
        report.status=cancelled?'cancelled':report.turns.length===2&&report.turns.every(t=>t.status==='awaiting_manual_review')?'awaiting_manual_review':'incomplete';
    }finally{await save();process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
    console.log(output);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
