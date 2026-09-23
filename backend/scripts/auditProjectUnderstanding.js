// Single sequential local-model smoke check; isolated audit store, no production DB.
require('dotenv').config({quiet:true});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const fetchLocal=globalThis.fetch;
globalThis.fetch=(url,options)=>{
    if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Only local Ollama allowed');
    return fetchLocal(url,options);
};
const {createService,localRepository}=require('../src/memory/projectUnderstanding');
async function main(){
    const directory=path.resolve(__dirname,'../.local/project-understanding-audits',String(Date.now()));
    const report={scope:'Real source reader and service; isolated local store; semantic accuracy requires manual review. Comparison is one sequential sample per condition, not proof of superiority.',calls:[],replies:[]};
    let condition;
    const options={agentId:'alice',complete:async(messages,settings)=>{
        const raw=await require('../src/models/providers/ollama').complete(messages,settings);
        report.calls.push({condition,messages,model:settings.model,raw});return raw;
    }};
    try{
        for(const includeStructure of (process.argv.includes('--compare') ? [false,true] : [true])) {
        condition=includeStructure ? 'with-structure' : 'source-only';
        const storeDirectory=path.join(directory,condition);
        const before=report.calls.length;
        const service=createService({repository:localRepository(storeDirectory),includeStructure});
        report.replies.push(await service.handle({action:'learn',filename:'src/agents/agentProfiles.js'},options));
        const restarted=createService({repository:localRepository(storeDirectory),includeStructure});
        report.replies.push(await restarted.handle({action:'recall',filename:'src/agents/agentProfiles.js'},options));
        report.replies.push(await restarted.handle({action:'learn',filename:'src/agents/agentProfiles.js'},options));
        assert.equal(report.calls.length-before,1);
        }
    }catch(error){report.error=error.message;process.exitCode=1;}
    await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({directory,calls:report.calls.length,error:report.error}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
