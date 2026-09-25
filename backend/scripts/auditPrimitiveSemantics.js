require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Local model only');return originalFetch(url,options);};
const cases=[
    {file:'src/tools/utilities/percentage.js',question:'For total 14, compare percentage inputs "7kg" and "kg7". Give each exact result and explain whether numeric prefixes are accepted.',expected:['7 is 50.00% of 14.','Error: Invalid numbers provided.'],run:()=>Promise.all(['7kg','kg7'].map(v=>require('../src/tools/utilities/percentage').execute(v,14)))},
    {file:'src/tools/utilities/characterCount.js',question:'Compare characterCount for " x y " and "x_y". Give both counts for each exact input, preserving surrounding and repeated spaces.',expected:['Character count (with spaces): 5\nCharacter count (without spaces): 2','Character count (with spaces): 3\nCharacter count (without spaces): 3'],run:()=>Promise.all([' x y ','x_y'].map(require('../src/tools/utilities/characterCount').execute))}
];
async function main(){
    const output=path.resolve(__dirname,'../.local/primitive-semantics-audit',Date.now()+'.json');
    await fs.mkdir(path.dirname(output),{recursive:true});const rows=[];
    for(const semantic of [false,true])for(const c of cases){
        const scoped=true;
        const evidenceBundle=true;
        const oracle=await c.run();assert.deepEqual(oracle,c.expected);
        const row={semantic,scoped,evidenceBundle,question:c.question,oracle};rows.push(row);
        try{row.result=await createService({repository:{get:async()=>null},evidenceBundle}).answer({filename:c.file,question:c.question,targetSymbol:path.basename(c.file,'.js'),inputBindings:semantic?[{inputId:'input0',parameter:c.file.includes('percentage')?'value':'text',arguments:c.file.includes('percentage')?{total:14}:{}},{inputId:'input1',parameter:c.file.includes('percentage')?'value':'text',arguments:c.file.includes('percentage')?{total:14}:{}}]:undefined},{agentId:'alice',complete:async(m,o)=>{row.messages=m;row.model=o.model;row.format=o.format;row.raw=await require('../src/models/providers/ollama').complete(m,o);return row.raw;}});}catch(e){row.error=e.message;}
        await fs.writeFile(output,JSON.stringify(rows,null,2));console.log(JSON.stringify({semantic,scoped,evidenceBundle,answer:row.result?.answer,error:row.error}));
    }
    console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
