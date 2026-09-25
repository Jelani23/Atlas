const assert=require('node:assert/strict');
const {buildBundle,citableFacts}=require('../src/reasoning/sourceBundle');
const {scopeBundle}=require('../src/reasoning/symbolScope');
const {deriveOperationEvidence,selectOperations}=require('../src/reasoning/operationEvidence');
async function derive(body,extra=''){
    const source={path:'src/fixture.js',version:'d'.repeat(64),complete:true,text:`1: ${extra} function inspect(value){${body}}`};
    const bundle=scopeBundle((await buildBundle(source,{maxChars:30000})).bundle,'inspect');
    const facts=deriveOperationEvidence(bundle);bundle.facts.push(...facts);
    assert(facts.every(f=>citableFacts(bundle).some(c=>c.id===f.id)));
    return facts;
}
async function main(){
    assert((await derive('return new Set(value);')).some(f=>f.rule==='ordinary-set-uniqueness'));
    assert(!(await derive('return new Set(value);','const Set=custom;')).some(f=>f.rule==='ordinary-set-uniqueness'));
    assert(!(await derive('return new Set(value);','const {Set}=custom;')).some(f=>f.rule==='ordinary-set-uniqueness'));
    assert.equal((await derive('Set=custom; return new Set(value);')).length,0);
    const split=await derive(String.raw`return value.split(/\s+/);`);
    assert(split.some(f=>f.rule==='string-whitespace-split'));
    assert(!(await derive(String.raw`return value.split(/\S+/);`)).some(f=>f.rule==='string-whitespace-split'));
    const removal=await derive(String.raw`return value.replace(/[^a-z0-9\s]/g, "");`);
    assert(removal.some(f=>f.rule==='string-ascii-filter-removal'));
    const failed=await derive('try { return value.toLowerCase(); } catch(problem) { return "Failed: " + problem.message; }');
    const access=failed.find(f=>f.rule==='nullish-property-access');
    assert(access.expression.includes('TypeError'));assert.equal(access.relatedIds.length,2);
    assert(!(await derive('return value?.trim();')).some(f=>f.rule==='nullish-property-access'));
    const nested=await derive('function nested(value){return value.trim();} return 1;');
    assert.equal(nested.length,0);
    const catchOwn=await derive('try { return 1; } catch(error) {return value.trim();}');
    assert(catchOwn.every(f=>f.relatedIds.length===1));
    const defaultSource={path:'src/fixture.js',version:'d'.repeat(64),complete:true,text:'1: function inspect(value=""){return value.trim();}'};
    const defaults=scopeBundle((await buildBundle(defaultSource)).bundle,'inspect');
    assert(!deriveOperationEvidence(defaults).some(f=>f.rule==='nullish-property-access'));
    const selected=await derive('return new Set(value);');
    assert.throws(()=>selectOperations(['missing'],selected),/Unknown/);
    assert.throws(()=>selectOperations(null,selected),/Invalid/);
    assert.throws(()=>selectOperations([selected[0].id,selected[0].id],selected),/Invalid/);
    const source={path:'src/fixture.js',version:'d'.repeat(64),complete:true,text:'1: function inspect(value){return new Set(value);}'};
    const service=require('../src/reasoning/projectQuestion').createService({repository:{get:async()=>null},read:async()=>source,evidenceBundle:true});
    const result=await service.answer({filename:source.path,question:'Explain duplicates and order',targetSymbol:'inspect'},{agentId:'alice',complete:async(m,o)=>{
        const id=o.format.properties.operationIds.items.enum[0];
        return JSON.stringify({claims:[{text:'REPEATED PARAPHRASE',evidenceIds:[id]}],unknowns:[],operationIds:[id]});
    }});
    assert.match(result.speech,/duplicate equal values only once/);
    assert.doesNotMatch(result.speech,/REPEATED PARAPHRASE|src\//);
    assert.doesNotMatch(result.reply,/REPEATED PARAPHRASE/);
    assert.equal(result.selectedOperations.length,1);
    console.log('Operation consequences: container uniqueness, delimiter semantics and conditional nullish errors passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
