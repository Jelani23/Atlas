const assert=require('node:assert/strict');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {buildFunctionRecords}=require('../src/reasoning/functionBehavior');
const {evaluateScenarios,presentScenario}=require('../src/reasoning/functionScenario');
async function scenario(body,value,asyncPrefix=''){
    const source={path:'src/example.js',version:'a'.repeat(64),complete:true,text:`1: ${asyncPrefix}function example(text){${body}}`};
    const bundle=(await buildBundle(source,{maxChars:60000})).bundle,record=buildFunctionRecords(bundle).records[0];
    const inputs=[{id:'input0',exactText:JSON.stringify(value)}];
    return {bundle,record,inputs,result:evaluateScenarios(bundle,record,inputs,[{inputId:'input0',parameter:'text'}])[0]};
}
async function main(){
    const counted=await scenario('const count=text.trim().split(/\\s+/).length; return `Word count: ${count}`;','red blue red','async ');
    assert.deepEqual(counted.result.outcome.result,{type:'string',value:'Word count: 3'});assert.equal(counted.result.outcome.kind,'resolve');
    assert.match(presentScenario(counted.result,counted.inputs[0]),/promise that fulfills with "Word count: 3"/);
    const empty=await scenario('if(!text)return "empty"; return text;','');
    assert.equal(empty.result.outcome.result.value,'empty');
    const plain=await scenario('if(!text)return "empty"; return text;','hello');assert.equal(plain.result.outcome.result.value,'hello');
    const thrown=await scenario('try {throw text;} catch(e){return `Caught: ${e}`;}','bad');assert.equal(thrown.result.outcome.result.value,'Caught: bad');
    const override=await scenario('try {return text;} finally {return "override";}','other');assert.equal(override.result.outcome.result.value,'override');
    const unsupported=await scenario('return new Set(text);','abc');assert.equal(unsupported.result.outcome.status,'unresolved');
    assert.match(presentScenario(unsupported.result,unsupported.inputs[0]),/Intermediate values do not establish/);
    const nullish=await scenario('return text.trim();',null);assert.equal(nullish.result.outcome.status,'unresolved');
    assert.equal((await scenario('const Number=unknown; return Number(text);','2')).result.outcome.status,'unresolved');
    assert.throws(()=>evaluateScenarios(plain.bundle,plain.record,plain.inputs,[{inputId:'input0',parameter:'other'}]),/Unsupported/);
    assert.throws(()=>evaluateScenarios(plain.bundle,plain.record,plain.inputs,[{inputId:'input0',parameter:'text',arguments:{text:'changed'}}]),/Invalid/);
    assert.throws(()=>evaluateScenarios({...plain.bundle,files:plain.bundle.files.map(f=>({...f,version:'b'.repeat(64)}))},plain.record,plain.inputs,[]),/match/);
    const mutationText='String.prototype.trim=custom; function example(text){return text.trim();}';
    const mutated=(await buildBundle({path:'src/mutated.js',version:'b'.repeat(64),complete:true,text:'1: '+mutationText})).bundle;
    const mutatedRecord=buildFunctionRecords(mutated).records[0];
    assert.equal(evaluateScenarios(mutated,mutatedRecord,[{id:'input0',exactText:'" abc "'}],[{inputId:'input0',parameter:'text'}])[0].outcome.status,'unresolved');
    const service=require('../src/reasoning/projectQuestion').createService({repository:{get:async()=>null},evidenceBundle:true});
    const answer=await service.answer({filename:'src/tools/utilities/wordCount.js',question:'Explain with text set to red blue red end input.',analysisMode:true},{agentId:'alice',complete:async(m,o)=>{
        assert.equal(o.format.properties.predictions.maxItems,0);assert.equal(o.format.properties.claims.maxItems,0);
        assert.match(m[1].content,/Word count: 3/);
        const id=o.format.properties.claims.items.properties.evidenceIds.items.enum[0];
        return JSON.stringify({claims:[{text:'WRONG NARRATIVE synchronous number result',evidenceIds:[id]}],predictions:[{inputId:'input0',outcome:'WRONG INTERMEDIATE',evidenceIds:[id]}],unknowns:[],expressionAssertions:[],operationIds:[]});
    }});
    assert.match(answer.reply,/promise that fulfills with "Word count: 3"/);
    assert.doesNotMatch(answer.reply,/WRONG INTERMEDIATE|WRONG NARRATIVE/);assert.doesNotMatch(answer.speech,/WRONG INTERMEDIATE|WRONG NARRATIVE/);
    assert.equal(answer.scenarios[0].outcome.kind,'resolve');
    console.log('Function scenarios preserve values, formatted returns, async wrappers and unresolved outcomes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
