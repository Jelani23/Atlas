const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {buildFunctionRecords}=require('../src/reasoning/functionBehavior');
const {buildAnalysisContext}=require('../src/reasoning/analysisContext');
const source=(path,text)=>({path,complete:true,version:crypto.createHash('sha256').update(text).digest('hex'),text:text.split('\n').map((l,i)=>`${i+1}: ${l}`).join('\n')});
async function setup(text,dependency){
    const bundle=(await buildBundle(source('src/root.js',text),{maxChars:60000,read:async()=>source('src/helper.js',dependency)})).bundle;
    const inventory=buildFunctionRecords(bundle);
    return {bundle,inventory,make:(name,limits)=>buildAnalysisContext(bundle,inventory,inventory.records.find(r=>r.name===name).id,limits)};
}
async function main(){
    const s=await setup('function leaf(value){return !value;} function main(text){return leaf(text);}');
    const packet=s.make('main');
    assert.equal(packet.nodes.length,2);assert.equal(packet.edges[0].status,'statically_linked');
    assert.equal(packet.sources.length,1);assert.match(packet.sources[0].source,/function leaf/);
    assert.equal(packet.edges[0].targetIncluded,true);
    assert.deepEqual(packet.edges[0].parameterMapping,[{parameter:'value',argumentExpression:'text',status:'source_expression'}]);
    assert.equal(packet.nodes[1].booleanReturn.condition.kind,'falsy');
    assert.deepEqual(packet,s.make('main'));
    const limited=s.make('main',{maxDepth:0});assert.match(limited.sources[0].source,/function leaf/);assert.match(limited.evidencePolicy.missingInformation,/does not imply/);assert.equal(limited.nodes.length,1);assert.equal(limited.edges[0].targetIncluded,false);assert.equal(limited.omissions[0].reason,'depth_limit');
    assert.notEqual(limited.cacheKey,packet.cacheKey);
    assert.equal(s.make('main',{maxNodes:1}).edges[0].targetIncluded,false);
    const cycle=await setup('function a(x){return b(x);} function b(y){return a(y);}');
    const cyclic=cycle.make('a');assert.equal(cyclic.nodes.length,2);assert.equal(cyclic.edges.length,2);
    const shadow=await setup('function leaf(x){return x;} function main(leaf){return leaf(1);}');
    assert.equal(shadow.make('main').edges[0].status,'unresolved');
    const caught=await setup('function main(x){x.before();try{return x.inside();}catch(e){return null;}}');
    const cp=caught.make('main');
    assert.equal(cp.nodes[0].exceptionRegions.length,1);
    assert.equal(cp.edges.find(e=>e.callee==='x.before').handlerCandidates.length,0);
    assert.equal(cp.edges.find(e=>e.callee==='x.inside').handlerCandidates.length,1);
    const imported='const {helper}=require("./helper");function main(){return helper();}';
    const a=await setup(imported,'function helper(value){return 1;}module.exports={helper};');
    const b=await setup(imported,'function helper(value){return 2;}module.exports={helper};');
    assert.equal(a.make('main').nodes.length,2);
    assert.equal(a.make('main').sources.length,2);
    assert.equal(a.make('main').edges[0].parameterMapping[0].status,'omitted_at_call');
    assert.notEqual(a.make('main').cacheKey,b.make('main').cacheKey);
    assert.throws(()=>buildAnalysisContext(b.bundle,a.inventory,a.inventory.records.find(r=>r.name==='main').id),/must match/);
    assert.throws(()=>s.make('main',{maxChars:2000}),/budget/);
    console.log('Analysis contexts: helper binding, arguments, cycles, limits, shadowing and dependency freshness passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
