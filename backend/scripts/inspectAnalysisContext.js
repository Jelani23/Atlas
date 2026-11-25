// Offline artifact only. Does not call a model, load analyzed modules or persist memories.
const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
    const [filename,name]=process.argv.slice(2);
    if(!filename||!name)throw new Error('Supply src/... filename and function name.');
    const {readRange}=require('../src/core/sourceReader');
    const built=await require('../src/reasoning/sourceBundle').buildBundle(await readRange(filename,1,200),{read:readRange});
    const inventory=require('../src/reasoning/functionBehavior').buildFunctionRecords(built.bundle);
    const roots=inventory.records.filter(r=>r.source.path===filename&&r.name===name);
    if(roots.length!==1)throw new Error('Select one unique function in the root file.');
    const packet=require('../src/reasoning/analysisContext').buildAnalysisContext(built.bundle,inventory,roots[0].id);
    await built.assertCurrent();
    const directory=path.resolve(__dirname,'../.local/analysis-context');await fs.mkdir(directory,{recursive:true});
    const output=path.join(directory,Date.now()+'.json');await fs.writeFile(output,JSON.stringify(packet,null,2));
    console.log(JSON.stringify({output,functions:packet.nodes.map(n=>n.name),links:packet.edges.map(e=>({callee:e.callee,status:e.status,targetIncluded:e.targetIncluded})),omissions:packet.omissions},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
