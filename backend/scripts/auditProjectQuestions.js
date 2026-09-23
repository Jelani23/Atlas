require('dotenv').config({quiet:true});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const {readRange}=require('../src/core/sourceReader');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Only local model allowed');return originalFetch(url,options);};
const cases=[
    {file:'src/utils/keywordExtractor.js',question:'What is the purpose of src/utils/keywordExtractor.js, and what does extractKeywords("Can cats cats fly?") return? Does it preserve duplicates?',expected:['cats','fly'],run:()=>[...require('../src/utils/keywordExtractor').extractKeywords('Can cats cats fly?')]},
    {file:'src/utils/keywordExtractor.js',question:'In src/utils/keywordExtractor.js, does punctuation become a space? Give the exact tokens for "foo-bar CAT" and explain that consequence.',expected:['foobar','cat'],run:()=>[...require('../src/utils/keywordExtractor').extractKeywords('foo-bar CAT')]},
    {file:'src/response/recovery.js',question:'How does src/response/recovery.js decide to recover? For a nonempty reply and doneReason length, and for an empty reply with no metadata, give the two booleans.',expected:[true,true],run:()=>{const {shouldRecoverResponse:f}=require('../src/response/recovery');return [f('hello',{doneReason:'length'}),f('',undefined)];}},
    {file:'src/response/recovery.js',question:'Explain how src/response/recovery.js prevents duplicated text. Give exact getRecoveryAppend results for ("abcdefgh123", "abcdefgh123 tail") and ("hello", "lo again"). Is every overlap removed?',expected:[' tail','lo again'],run:()=>{const {getRecoveryAppend:f}=require('../src/response/recovery');return [f('abcdefgh123','abcdefgh123 tail'),f('hello','lo again')];}},
    {file:'src/memory/projectExtractionScope.js',question:'In src/memory/projectExtractionScope.js, projects are [{project_key:"alpha",name:"Alpha"},{project_key:"beta",name:"Beta"}], current_project is "beta". What projects are selected for "Redis is useful"? Does active project alone establish ownership?',expected:[],run:()=>require('../src/memory/projectExtractionScope').projectExtractionScope('Redis is useful',[{project_key:'alpha',name:'Alpha'},{project_key:'beta',name:'Beta'}],{current_project:'beta'})},
    {file:'src/memory/projectExtractionScope.js',question:'Using src/memory/projectExtractionScope.js, projects are [{project_key:"alpha",name:"Alpha"},{project_key:"beta",name:"Beta"}], current_project is "beta". What is selected for "This project needs tests" versus "Alphabet needs tests"? Explain contextual versus named matching.',expected:[['beta'],[]],run:()=>{const f=require('../src/memory/projectExtractionScope').projectExtractionScope;const p=[{project_key:'alpha',name:'Alpha'},{project_key:'beta',name:'Beta'}];return ['This project needs tests','Alphabet needs tests'].map(m=>f(m,p,{current_project:'beta'}).map(x=>x.project_key));}}
];
async function main(){
    const output=path.resolve(__dirname,'../.local/project-question-audits',`${Date.now()}.json`);
    const report={scope:'Real question service with real source reads; isolated synthetic current/stale/no-memory retrieval. Six new questions, fixed authored oracles, manual semantic review. No production writes.',results:[]};
    await fs.mkdir(path.dirname(output),{recursive:true});
    for(const [i,c] of cases.entries()){
        const observed=c.run();assert.deepEqual(observed,c.expected);
        const source=readRange(c.file,1,200);
        const record=i%3===0?null:{schema:2,project:'atlas',agentId:'alice',path:c.file,version:i%3===1?source.version:'0'.repeat(64),analysis:{observations:[{text:'Unverified old interpretation: all matching and edge cases behave intuitively.'}]}};
        const row={question:c.question,oracle:observed,retrieval:i%3===0?'missing':i%3===1?'current-unverified':'stale'};report.results.push(row);
        try{row.result=await createService({repository:{get:async()=>record}}).answer({filename:c.file,question:c.question},{agentId:'alice',complete:async(messages,options)=>{
            row.messages=messages;const start=Date.now();const raw=await require('../src/models/providers/ollama').complete(messages,options);row.raw=raw;row.durationMs=Date.now()-start;return raw;
        }});}catch(error){row.error=error.message;process.exitCode=1;}
        await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({case:i+1,error:row.error}));if(row.error)break;
    }
    console.log(output);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
