require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Local model only');return originalFetch(url,options);};
const cases=[
    {file:'src/tools/utilities/wordCount.js',question:'What does the word count function return for an empty string versus "red blue"? Explain the operations, even if the empty result seems surprising.',expected:['Word count: 1','Word count: 2'],run:()=>Promise.all(['','red blue'].map(require('../src/tools/utilities/wordCount').execute))},
    {file:'src/tools/utilities/characterCount.js',question:'For characterCount input "a\\tb", where \\t is one tab, what are the two counts? Does without spaces remove only ordinary spaces?',expected:'Character count (with spaces): 3\nCharacter count (without spaces): 2',run:()=>require('../src/tools/utilities/characterCount').execute('a\tb')},
    {file:'src/utils/unitConversionRequest.js',question:'For "convert 4 plus 2 meters to feet", does the parser evaluate the arithmetic? Explain what the normalizer and caller each do, marking any uninspected dependency.',expected:null,run:()=>require('../src/utils/unitConversionRequest').parseUnitConversionRequest('convert 4 plus 2 meters to feet')}
];
async function main(){
    const output=path.resolve(__dirname,'../.local/source-bundle-audit',Date.now()+'.json');
    await fs.mkdir(path.dirname(output),{recursive:true});const rows=[];
    for(const evidenceBundle of [false,true])for(const c of cases){
        const oracle=await c.run();assert.deepEqual(oracle,c.expected);
        const row={evidenceBundle,question:c.question,oracle};rows.push(row);
        try{row.result=await createService({repository:{get:async()=>null},evidenceBundle}).answer({filename:c.file,question:c.question},{agentId:'alice',complete:async(m,o)=>{row.messages=m;row.model=o.model;row.format=o.format;row.raw=await require('../src/models/providers/ollama').complete(m,o);return row.raw;}});}catch(e){row.error=e.message;}
        await fs.writeFile(output,JSON.stringify(rows,null,2));console.log(JSON.stringify({evidenceBundle,answer:row.result?.answer,error:row.error}));
    }
    console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
