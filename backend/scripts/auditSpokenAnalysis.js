require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises'),path=require('node:path');
const {detect,createService}=require('../src/reasoning/projectQuestion');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Local model only');return originalFetch(url,options);};
async function main(){
    await require('../src/core/projectCache').initialize();
    const rows=[],output=path.resolve(__dirname,'../.local/spoken-analysis-audit',Date.now()+'.json');await fs.mkdir(path.dirname(output),{recursive:true});let prior=null;
    const scenarios=process.argv.includes('--scenario-check')?['Analyze the character count file with text set to a b end input.','What does that file count as whitespace?','Analyze the word count file with text set to one two three end input.','Analyze the keyword extractor with text set to blue-green blue end input.']:null;
    for(const question of (process.argv.includes('--resume-scenarios')?scenarios.slice(2):scenarios)||['Analyze the keyword extractor with text set to hello','What does that file do with repeated words and punctuation?','Analyze the word count file with text set to hello world','What does that file do if the input is missing?']){
        const row={question};rows.push(row);
        try{
            row.command=detect(question,prior,'alice');
            row.result=await createService({repository:{get:async()=>null},evidenceBundle:row.command.analysisMode===true,coverageContract:process.argv.includes('--coverage-contract')}).answer(row.command,{agentId:'alice',complete:async(m,o)=>{row.messages=m;row.raw=await require('../src/models/providers/ollama').complete(m,o);return row.raw;}});
            prior={path:row.result.path,agentId:'alice',at:Date.now(),question:row.command.contextQuestion||row.command.question,analysisMode:true,targetSymbol:row.result.coverage?.target?.name};
        }catch(e){row.error=e.message;prior=null;}
        await fs.writeFile(output,JSON.stringify(rows,null,2));console.log(JSON.stringify({question,error:row.error,claims:row.result?.answer.claims?.map(c=>c.text),predictions:row.result?.answer.predictions?.map(c=>c.text),consistency:row.result?.branchConsistency}));
    }
    console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
