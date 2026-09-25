const assert=require('node:assert/strict');
const {selectTarget,parseAssignments}=require('../src/reasoning/spokenAnalysis');
const {detect,createService}=require('../src/reasoning/projectQuestion');
async function main(){
    const bundle={files:[{path:'src/utilities/example.js'}],target:{symbolId:'x'},symbols:[{id:'x',name:'example',owner:'v0:module',span:{path:'src/utilities/example.js'},parameters:['text','enabled','total']} ]};
    assert.equal(selectTarget(bundle),'example');
    assert.equal(parseAssignments('Analyze with text set to hello end input.',bundle).inputs[0].exactText,'"hello"');
    assert.equal(parseAssignments('Analyze with text set to hello.',bundle).inputs[0].exactText,'"hello."');
    assert.equal(parseAssignments('Analyze with text set to "hello.".',bundle).inputs[0].exactText,'"hello."');
    assert.equal(parseAssignments('Analyze with text set to "end input"',bundle).inputs[0].exactText,'"end input"');
    const parsed=parseAssignments('Analyze example with text set to hello and enabled set to true and total set to 14',bundle);
    assert.equal(parsed.inputs[0].exactText,'"hello"');assert.deepEqual(parsed.bindings[0].arguments,{enabled:true,total:14});
    assert.equal(parseAssignments('Explain with text set to " a and enabled set to false "',bundle).inputs[0].exactText,'" a and enabled set to false "');
    assert.equal(parseAssignments('Explain with total set to 14',bundle).inputs[0].exactText,'14');
    assert.equal(parseAssignments('Explain with enabled set to false',bundle).inputs[0].exactText,'false');
    for(const q of ['Explain with missing set to a','Explain with text set to a and text set to b','Explain with text set to "broken','Explain with text set to'])assert.throws(()=>parseAssignments(q,bundle));
    assert.equal(parseAssignments('Explain how it works',bundle),null);
    assert.throws(()=>selectTarget({...bundle,symbols:[...bundle.symbols,{...bundle.symbols[0],id:'y',name:'other'}],files:[{path:'src/utilities/example.js'}]},'unknown'),/Please name/);
    const tree=['src/utilities/example.js'];
    const command=detect('Analyze the example file with text set to hello',null,'alice',0,tree);
    assert.equal(command.analysisMode,true);
    const prior={path:tree[0],agentId:'alice',at:0,analysisMode:true,targetSymbol:'example'};
    assert.equal(detect('What does that file do?',prior,'alice',1,tree).analysisMode,true);
    assert.equal(detect('What does that file do?',prior,'bob',1,tree),null);
    assert.equal(detect('What does that file do?',prior,'alice',600001,tree),null);
    assert.equal(detect('How does the example file work?',prior,'alice',1,tree).analysisMode,undefined);
    const source={path:tree[0],version:'c'.repeat(64),complete:true,text:'1: function example(text){if(text === "") return "empty"; return "ready";}'};
    const answer=await createService({repository:{get:async()=>null},read:async()=>source,evidenceBundle:true}).answer(command,{agentId:'alice',complete:async(m,o)=>{
        const packet=JSON.parse(m[1].content.split('EVIDENCE:\n')[1]);
        assert.equal(packet.bundle.request.inputBindings[0].parameter,'text');
        const branches=packet.bundle.facts.filter(f=>f.kind==='branch-selection');
        return JSON.stringify({claims:[{text:'The empty branch in src/utilities/example.js is skipped.',evidenceIds:[branches[0].id]}],predictions:[],unknowns:[],expressionAssertions:[],branchAssertions:branches.map(f=>({factId:f.id,selectedBranch:f.selectedBranch}))});
    }});
    assert.equal(answer.questionCoverage,null);assert.equal(answer.branchConsistency,null);assert.equal(answer.scenarios[0].outcome.result.value,'ready');assert.equal(answer.coverage.target.name,'example');
    assert.doesNotMatch(answer.speech,/src\/|Source:/);assert.match(answer.reply,/Inputs understood: text = "hello"/);
    assert.match(answer.reply,/Atlas source reference inventory/);
    assert.match(answer.reply,/text: parameter; read/);
    assert.doesNotMatch(answer.speech,/source reference inventory/);
    assert.equal(answer.functionInputs.references.find(r=>r.name==='text').ownership,'parameter');
    const liveSourceService=createService({repository:{get:async()=>null},evidenceBundle:true});
    let modelCalls=0;
    async function sourceAnswer(filename,question){return liveSourceService.answer({filename,question,analysisMode:true},{agentId:'alice',complete:async(m,o)=>{
        modelCalls++;
        const packet=JSON.parse(m[1].content.split('EVIDENCE:\n')[1]);
        return JSON.stringify({claims:[{text:'Source inspected.',evidenceIds:[packet.bundle.facts[0].id]}],unknowns:[],operationIds:[]});
    }});}
    const recovery=await sourceAnswer('src/response/recovery.js','Analyze the recovery file function should recover response.');
    assert.match(recovery.reply,/completionMeta: parameter; read/);
    assert.match(recovery.reply,/String: unresolved binding; read/);
    assert.doesNotMatch(recovery.reply,/Math: unresolved binding/); // Other function excluded.
    assert.equal(modelCalls,0,'Supported Boolean outline must not depend on model prose.');
    assert.match(recovery.reply,/Otherwise, it returns false/);
    assert.match(recovery.reply,/only when the left is false/);
    assert.doesNotMatch(recovery.reply,/Source inspected|Missing evidence:/);
    assert.match(recovery.speech,/result of the trim call/);
    assert.doesNotMatch(recovery.speech,/String\(reply/);
    const append=await sourceAnswer('src/response/recovery.js','Analyze the recovery file function get recovery append.');
    assert.match(append.reply,/existingReply: parameter; read/);
    assert.match(append.reply,/Math: unresolved binding; read/);
    assert.doesNotMatch(append.reply,/completionMeta: parameter/);
    assert.equal(modelCalls,1,'Unsupported loop function retains the existing model path.');
    console.log('Spoken opt-in, explicit typed assignments, quoting, scope and session boundaries passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
