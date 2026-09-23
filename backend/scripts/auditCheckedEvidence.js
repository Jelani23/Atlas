require('dotenv').config({quiet:true});
const fs=require('node:fs/promises');
const path=require('node:path');
const {readRange}=require('../src/core/sourceReader');
const checks=require('../src/reasoning/profileEvidence');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Only local model allowed');return originalFetch(url,options);};
async function main(){
    const source=readRange('src/agents/agentProfiles.js',1,200);
    const evidence=await checks.collect(source,{authorized:true});
    const calls=[];
    evidence.commentary=await checks.explain(source,evidence,{complete:async(messages,options)=>{
        const raw=await require('../src/models/providers/ollama').complete(messages,options);calls.push({messages,raw,model:options.model});return raw;
    }});
    const output=path.resolve(__dirname,'../.local/checked-evidence-audits',`${Date.now()}.json`);
    await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({evidence,calls},null,2));
    console.log(JSON.stringify({output,checks:evidence.results.length,commentary:evidence.commentary.status}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
