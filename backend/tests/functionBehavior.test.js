const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {buildFunctionRecords}=require('../src/reasoning/functionBehavior');
function source(path,text){return {path,complete:true,version:crypto.createHash('sha256').update(text).digest('hex'),text:text.split('\n').map((l,i)=>`${i+1}: ${l}`).join('\n')};}
async function records(text){return buildFunctionRecords((await buildBundle(source('src/fixture.js',text),{maxChars:60000})).bundle).records;}
async function main(){
    const inventory=await records('function outer(x){ if(x) return "yes"; function nested(){return 99;} try { throw new Error("bad"); } catch(err){return `Error: ${err.message}`;} finally {cleanup();} }');
    const outer=inventory.find(f=>f.name==='outer'),nested=inventory.find(f=>f.name==='nested');
    assert.deepEqual(outer.exits.map(e=>e.expression),['"yes"','new Error("bad")','`Error: ${err.message}`']);
    assert.equal(nested.exits[0].expression,'99');
    assert.equal(outer.exits[0].conditions[0].branch,'then');
    assert.equal(outer.exceptionRegions[0].catchBinding,'err');assert(outer.exceptionRegions[0].finallySpan);
    assert.deepEqual(outer.exits[1].handlerCandidates,[outer.exceptionRegions[0].id]);
    assert.deepEqual(outer.exits[2].handlerCandidates,[]);
    assert(outer.exits.every(e=>e.completion==='unresolved'&&e.expressionStatus==='source_expression_not_evaluated'));
    assert.equal(outer.executedObservations.length,0);
    assert(outer.calls.find(c=>c.callee==='cleanup').regions.some(r=>r.part==='finally'));
    const retry=(await records('function retry(){try {try {throw error;} catch(inner){throw inner;}} catch(outer){return outer;}}'))[0];
    assert.equal(retry.exits[0].handlerCandidates.length,2);
    assert.deepEqual(retry.exits[1].handlerCandidates,[retry.exceptionRegions[0].id]);
    const arrows=await records('const show=async x=>`Count: ${x}`; const nothing=()=>{return;};');
    assert.equal(arrows[0].async,true);assert.equal(arrows[0].exits[0].expression,'`Count: ${x}`');
    assert.equal(arrows[1].exits[0].expression,null);
    const state=(await records('function tick(){ cache.count++; cache.last=Date.now(); return db.read(); }'))[0];
    assert(state.stateAccessCandidates.some(c=>c.kind==='mutation'));
    assert(state.stateAccessCandidates.some(c=>c.kind==='assignment'));
    assert(state.calls.some(c=>c.callee==='Date.now'&&c.resolution.status==='unresolved'));
    assert.equal((await records('function f(){while(true){return 1;}}'))[0].coverage.completion,'partial');
    const withClass=(await records('function enclosing(){ class Example { field=unexecuted(); method(){return 4;} } return Example; }')).find(f=>f.name==='enclosing');
    assert(!withClass.calls.some(c=>c.callee==='unexecuted'));
    assert(withClass.coverage.gaps.some(g=>g.includes('Class initialization')));
    const root=source('src/root.js','const {helper}=require("./helper"); function main(){return helper();}');
    async function version(value){const dep=source('src/helper.js',`function helper(){return ${value};} module.exports={helper};`);return buildFunctionRecords((await buildBundle(root,{read:async()=>dep,maxChars:60000})).bundle).records.find(f=>f.name==='main');}
    const a=await version(1),b=await version(2);assert.notEqual(a.cacheKey,b.cacheKey);assert.equal(a.source.version,b.source.version);
    assert.equal(a.calls[0].resolution.status,'statically_linked');
    const bundled=(await buildBundle(source('src/a.js','function f(){return 1;}'))).bundle;
    assert.throws(()=>buildFunctionRecords({...bundled,files:bundled.files.map(f=>({...f,complete:false}))}),/unprojected/);
    assert.throws(()=>buildFunctionRecords({...bundled,files:bundled.files.map(f=>({...f,source:'2: function f(){}'}))}),/contiguous/);
    assert.deepEqual(buildFunctionRecords(bundled),buildFunctionRecords(bundled));
    console.log('Unified function records: exits, enclosure ownership, catch/finally boundaries and dependency invalidation passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
