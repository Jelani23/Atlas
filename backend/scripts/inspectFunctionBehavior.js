// Developer inspection tool. Reads source; writes only a local diagnostic artifact.
const fs=require('node:fs/promises');
const path=require('node:path');
const {readRange}=require('../src/core/sourceReader');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {buildFunctionRecords}=require('../src/reasoning/functionBehavior');
async function main(){
    const filenames=process.argv.slice(2);if(!filenames.length||filenames.length>4)throw new Error('Supply one to four src/... source paths.');
    const records=[];
    for(const filename of filenames){
        const source=await readRange(filename,1,200);
        const built=await buildBundle(source,{read:readRange});
        records.push(buildFunctionRecords(built.bundle));await built.assertCurrent();
    }
    const directory=path.resolve(__dirname,'../.local/function-behavior');await fs.mkdir(directory,{recursive:true});
    const output=path.join(directory,Date.now()+'.json');await fs.writeFile(output,JSON.stringify(records,null,2));
    console.log(JSON.stringify({output,functions:records.flatMap(r=>r.records.map(f=>({path:f.source.path,name:f.name,exits:f.exits.length,calls:f.calls.length,regions:f.exceptionRegions.length,completion:f.coverage.completion,finalOutcome:require('../src/reasoning/functionCompletion').exactOutcome(f)})))},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
