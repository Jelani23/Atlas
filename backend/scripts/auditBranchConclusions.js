require('dotenv').config({quiet:true,path:require('node:path').resolve(__dirname,'../.env')});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Local model only');return originalFetch(url,options);};
// Fixed developer-authored fixtures: analyzed as text, not executed or saved to project knowledge.
const cases=[
    {body:'if(text.trim()==="") return "empty"; else return "ready";',input:'hello',args:{},expected:'else',question:'For "hello", which branch is selected? Explain the condition without claiming a tested result.'},
    {body:'if(!enabled) return "disabled"; return text;',input:'hello',args:{enabled:true},expected:'fallthrough',question:'With enabled true and text "hello", is the disabled branch selected? Explain why.'},
    {body:'const size=text.length; if(size===3 && enabled) return "ready"; return "other";',input:'abc',args:{enabled:true},expected:'then',question:'For text "abc" and enabled true, explain which branch is selected.'}
];
async function main(){
    const output=path.resolve(__dirname,'../.local/branch-conclusions-audit',Date.now()+'.json');await fs.mkdir(path.dirname(output),{recursive:true});const rows=[];
    for(const c of cases){
        const source={path:'src/branchAudit.js',version:'b'.repeat(64),complete:true,text:`1: function route(text, enabled){${c.body}}`};
        const row={question:c.question,expected:c.expected};rows.push(row);
        try{row.result=await createService({repository:{get:async()=>null},read:async()=>source,evidenceBundle:true}).answer({filename:source.path,question:c.question,targetSymbol:'route',inputBindings:[{inputId:'input0',parameter:'text',arguments:c.args}]},{agentId:'alice',complete:async(m,o)=>{row.messages=m;row.raw=await require('../src/models/providers/ollama').complete(m,o);return row.raw;}});assert.equal(row.result.branchFacts[0].selectedBranch,c.expected);}catch(e){row.error=e.message;}
        await fs.writeFile(output,JSON.stringify(rows,null,2));console.log(JSON.stringify({question:c.question,branchConsistency:row.result?.branchConsistency,claims:row.result?.answer.claims?.map(c=>c.text),error:row.error}));
    }
    console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
