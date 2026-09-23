require('dotenv').config({quiet:true});
const fs=require('node:fs/promises');
const path=require('node:path');
const {readRange}=require('../src/core/sourceReader');
const {analyze}=require('../src/reasoning/focusedAnalysis');
const {cases,oracle}=require('../tests/fixtures/focusedProfileCases');
const fetchLocal=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Only local model allowed');return fetchLocal(url,options);};
async function main(){
    const source=readRange('src/agents/agentProfiles.js',1,200);
    const output=path.resolve(__dirname,'../.local/focused-analysis-audits',`${Date.now()}.json`);
    const general=process.argv.includes('--general');
    const report={source,general,scope:'Focused function excerpt plus enclosing setup. Fixed scenarios and executed authored oracles; model output never executed. Manual semantic review required.',results:[]};
    await fs.mkdir(path.dirname(output),{recursive:true});
    for(const c of cases){
        const row={id:c.id,scenario:c.scenario,oracle:await oracle(c),calls:[]};report.results.push(row);
        try{row.answer=await analyze({source,symbol:c.symbol,scenario:c.scenario,complete:async(messages,options)=>{
            if(general)options={...options,...require('../src/models/modelRouter').getDefaultModel()};
            const start=Date.now();const raw=await require('../src/models/providers/ollama').complete(messages,options);
            row.calls.push({messages,raw,model:options.model,durationMs:Date.now()-start});return raw;
        }});}catch(error){row.error=error.message;process.exitCode=1;}
        await fs.writeFile(output,JSON.stringify(report,null,2));
        console.log(JSON.stringify({id:c.id,error:row.error}));if(row.error)break;
    }
    console.log(output);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
