require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Local model only');return originalFetch(url,options);};
const cases=[
    {file:'src/tools/utilities/percentage.js',question:'For total 24, compare percentage inputs "12cats" and "cats12". Give each exact result and explain whether numeric prefixes are accepted.',expected:['12 is 50.00% of 24.','Error: Invalid numbers provided.'],run:()=>Promise.all(['12cats','cats12'].map(v=>require('../src/tools/utilities/percentage').execute(v,24)))},
    {file:'src/tools/utilities/characterCount.js',question:'Compare characterCount for " a  b " and "a-b". Give both counts for each exact input, preserving surrounding and repeated spaces.',expected:['Character count (with spaces): 6\nCharacter count (without spaces): 2','Character count (with spaces): 3\nCharacter count (without spaces): 3'],run:()=>Promise.all([' a  b ','a-b'].map(require('../src/tools/utilities/characterCount').execute))}
];
async function main(){
    const output=path.resolve(__dirname,'../.local/symbol-scope-audit',Date.now()+'.json');
    await fs.mkdir(path.dirname(output),{recursive:true});const rows=[];
    for(const scoped of [false,true])for(const c of cases){
        const evidenceBundle=true;
        const oracle=await c.run();assert.deepEqual(oracle,c.expected);
        const row={scoped,evidenceBundle,question:c.question,oracle};rows.push(row);
        try{row.result=await createService({repository:{get:async()=>null},evidenceBundle}).answer({filename:c.file,question:c.question,targetSymbol:scoped?path.basename(c.file,'.js'):undefined},{agentId:'alice',complete:async(m,o)=>{row.messages=m;row.model=o.model;row.format=o.format;row.raw=await require('../src/models/providers/ollama').complete(m,o);return row.raw;}});}catch(e){row.error=e.message;}
        await fs.writeFile(output,JSON.stringify(rows,null,2));console.log(JSON.stringify({scoped,evidenceBundle,answer:row.result?.answer,error:row.error}));
    }
    console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
