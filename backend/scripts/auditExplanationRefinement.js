// Fixed authored probes; no generated code, production storage or parallel model calls.
require('dotenv').config({quiet:true});
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createService}=require('../src/reasoning/projectQuestion');
const EXPLANATION_GUIDANCE=' Write for a listener: lead with the direct answer, then add only distinct details needed to understand it. Usually 1-3 claims suffice; do not repeat an overview as separate claims for each of its clauses. Do not recite constant lists, exports or callers unless the question needs them. For a follow-up, answer the new question rather than repeating the earlier overview. Explain the consequence of a relevant branch or transformation with one small input and exact predicted output when useful. Trace operations in their actual order, including early returns, preserved characters, defaults and boundary conditions. Do not substitute what a function name suggests for what its body does. Keep examples conditional on the supplied inputs; do not imply they were executed. Preserve meaningful whitespace and ordering in exact outputs. Use plain sentences; citations belong in lines, not in text. If the source does not establish a result, state that limit rather than guessing.';
const {detect}=require('../src/reasoning/projectQuestion');
const search=require('../src/utils/searchEvidence');
const policy=require('../src/memory/knowledgePersistencePolicy');
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{
    if(String(url)!=='http://localhost:11434/api/chat')throw new Error('Only local model allowed');
    return originalFetch(url,options);
};
const cases=[
    {question:'How does the search evidence file decide whether search evidence is available? Explain the main decision and its limits.',
        expected:[false,true,false],run:()=>[
            search.hasVerifiedSearchEvidence('SEARCH_STATUS: RESULTS_FOUND SEARCH_STATUS: NO_RESULTS'),
            search.hasVerifiedSearchEvidence('SEARCH_STATUS: RESULTS_FOUND Error: failed'),
            search.hasVerifiedSearchEvidence('short')],
        rubric:'NO_RESULTS wins over RESULTS_FOUND; found marker bypasses fallback. Fallback is a text heuristic, not independent truth verification.'},
    {question:'What does that file do if both status markers appear? Give the result and explain why.',
        expected:false,run:()=>search.hasVerifiedSearchEvidence('SEARCH_STATUS: RESULTS_FOUND SEARCH_STATUS: NO_RESULTS'),
        rubric:'false because the no-results test returns before the found-marker test. No repeated overview.'},
    {question:'How does the knowledge persistence policy work? Compare the settings " OFF " and "no". Are they both disabled?',
        expected:[false,true],run:()=>[' OFF ','no'].map(v=>policy.isSearchKnowledgePersistenceEnabled(v)),
        rubric:'false and true: trim/lowercase then exact membership in disabled set, not generic truthiness. Do not infer persistence actually ran.'}
];
async function main(){
    await require('../src/core/projectCache').initialize();
    const report={scope:'Paired original/refined instructions, same source, model and budgets. Manual correctness/usefulness/repetition review; no automatic semantic score.',results:[]};
    const output=path.resolve(__dirname,'../.local/explanation-refinement',Date.now()+'.json');
    await fs.mkdir(path.dirname(output),{recursive:true});
    const service=createService({repository:{get:async()=>null}});
    for(const variant of ['original','refined']){
        let prior;
        for(const probe of cases){
            const oracle=probe.run();assert.deepEqual(oracle,probe.expected);
            const command=detect(probe.question,prior,'alice');
            assert(command?.filename,'Probe must resolve through shared spoken-name/follow-up route');
            const row={variant,question:probe.question,oracle,rubric:probe.rubric};report.results.push(row);
            try{
                row.result=await service.answer(command,{agentId:'alice',complete:async(messages,options)=>{
                    if(variant==='refined')messages[0].content+=EXPLANATION_GUIDANCE;
                    row.messages=messages;row.model=options.model;
                    return require('../src/models/providers/ollama').complete(messages,options);
                }});
                prior={path:row.result.path,question:command.contextQuestion||command.question,agentId:'alice',at:Date.now()};
            }catch(error){row.error=error.message;}
            await fs.writeFile(output,JSON.stringify(report,null,2));
            console.log(JSON.stringify({variant,question:probe.question,error:row.error,answer:row.result?.answer}));
        }
    }
    console.log(output);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
