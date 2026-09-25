const assert=require('node:assert/strict');
const {buildBundle,citableFacts}=require('../src/reasoning/sourceBundle');
const {scopeBundle}=require('../src/reasoning/symbolScope');
const {quotedInputs}=require('../src/reasoning/questionInputs');
const {derivePrimitiveFacts}=require('../src/reasoning/primitiveSemantics');
const {deriveBranchConclusions,checkBranchAssertions,describeBranch}=require('../src/reasoning/branchConclusions');
function source(body){return {path:'src/branchFixture.js',version:'a'.repeat(64),complete:true,text:`1: function route(text, enabled){${body}}`};}
async function prepare(body,value,args={}){
    const bundle=scopeBundle((await buildBundle(source(body),{maxChars:30000})).bundle,'route');
    bundle.request.quotedInputs=quotedInputs(JSON.stringify(value));
    bundle.facts.push(...derivePrimitiveFacts(bundle,[{inputId:'input0',parameter:'text',arguments:args}]).facts);
    return bundle;
}
async function main(){
    // Authored source fixtures are parsed as data, never executed.
    const cases=[
        ['if(text.trim()==="") return "empty"; else return "ready";',' ',{},'then'],
        ['if(text.trim()==="") return "empty"; else return "ready";','hello',{},'else'],
        ['if(!enabled) return "disabled"; return text;','hello',{enabled:true},'fallthrough'],
        ['const size=text.length; if(size===3 && enabled) return "ready";','abc',{enabled:true},'then']
    ];
    for(const [body,input,args,expected] of cases){
        const bundle=await prepare(body,input,args),facts=deriveBranchConclusions(bundle);
        assert.equal(facts.length,1);assert.equal(facts[0].selectedBranch,expected);
        bundle.facts.push(...facts);assert(citableFacts(bundle).some(f=>f.id===facts[0].id));
        assert.equal(checkBranchAssertions([{factId:facts[0].id,selectedBranch:expected}],facts).status,'matched');
        assert.equal(checkBranchAssertions([{factId:facts[0].id,selectedBranch:expected==='then'?'else':'then'}],facts).status,'rejected');
        assert.equal(checkBranchAssertions([],facts).status,'incomplete');
        assert.match(describeBranch(facts[0]),/does not establish the final returned result/);
    }
    for(const body of ['if(enabled) return text;', 'if(custom(text)) return text;', 'if(text.length) return text;']){
        assert.equal(deriveBranchConclusions(await prepare(body,'abc')).length,0);
    }
    const sample=deriveBranchConclusions(await prepare('if(text==="") return "empty";','abc'));
    const good={factId:sample[0].id,selectedBranch:'fallthrough'};
    for(const list of [null,[null],[{...good,factId:'missing'}],[good,good],[{...good,extra:'claim'}],[{...good,selectedBranch:'return'}]])assert.equal(checkBranchAssertions(list,sample).status,'rejected');
    const partial=await prepare('if(text==="") return "empty"; else return "ready";','abc');
    partial.facts=partial.facts.filter(f=>f.kind!=='else');
    assert.equal(deriveBranchConclusions(partial).length,0);
    const body='if(text==="") return "empty"; return "ready";';
    const service=require('../src/reasoning/projectQuestion').createService({repository:{get:async()=>null},read:async()=>source(body),evidenceBundle:true});
    const result=await service.answer({filename:'src/branchFixture.js',question:'Inspect "abc"',targetSymbol:'route',inputBindings:[{inputId:'input0',parameter:'text'}]}, {agentId:'alice',complete:async(m,o)=>{
        const id=o.format.properties.branchAssertions.items.properties.factId.enum[0];
        return JSON.stringify({claims:[{text:'WRONG BRANCH',evidenceIds:[id]}],predictions:[],unknowns:[],expressionAssertions:[],branchAssertions:[{factId:id,selectedBranch:'then'}]});
    }});
    assert.equal(result.branchConsistency.status,'rejected');
    assert.doesNotMatch(result.reply,/WRONG BRANCH/);assert.doesNotMatch(result.speech,/WRONG BRANCH/);
    assert.match(result.reply,/if branch is skipped/);assert.equal(result.branchFacts[0].selectedBranch,'fallthrough');
    console.log('Conditional branch selection, unknown boundaries, citation support and mismatch withholding passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
