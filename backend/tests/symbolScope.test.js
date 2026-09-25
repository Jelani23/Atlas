const assert=require('node:assert/strict');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {scopeBundle}=require('../src/reasoning/symbolScope');
const {readRange}=require('../src/core/sourceReader');
async function main(){
    const built=await buildBundle(readRange('src/tools/utilities/characterCount.js',1,200));
    const scoped=scopeBundle(built.bundle,'characterCount');
    assert.match(scoped.files[0].source,/text.length/);
    assert.doesNotMatch(scoped.files[0].source,/extractParams|intentSchema|message\.match/);
    assert.equal(scoped.files[0].complete,false);
    assert.equal(built.bundle.files[0].complete,true);
    await built.assertCurrent();
    assert.throws(()=>scopeBundle(built.bundle,'missing'),/uniquely/);
    const text="const prefix='ok';\nfunction helper(x){return prefix+x;}\nfunction target(x){function inner(){return 1;} return helper(x);}\nfunction unrelated(){return 'bad';}\nmodule.exports={target};";
    const source={path:'src/scope.js',complete:true,version:'a'.repeat(64),text:text.split('\n').map((l,i)=>`${i+1}: ${l}`).join('\n')};
    const fixture=(await buildBundle(source)).bundle;
    const selected=scopeBundle(fixture,'target');
    assert.match(selected.files[0].source,/const prefix/);
    assert.match(selected.files[0].source,/function helper/);
    assert.match(selected.files[0].source,/function inner/);
    assert.doesNotMatch(selected.files[0].source,/unrelated|module.exports/);
    assert.throws(()=>scopeBundle(fixture,'inner'),/Nested/);
    assert.throws(()=>scopeBundle({...fixture,symbols:[...fixture.symbols,fixture.symbols.find(s=>s.name==='target')]},'target'),/uniquely/);
    const method={...source,text:'1: class C { method(){return this.x;} }'};
    const methodBundle=(await buildBundle(method)).bundle;
    assert.throws(()=>scopeBundle(methodBundle,'method'),/top-level/);
    const {createService}=require('../src/reasoning/projectQuestion');
    await createService({repository:{get:async()=>null},evidenceBundle:true}).answer({filename:'src/tools/utilities/characterCount.js',question:'Explain characterCount',targetSymbol:'characterCount'},{agentId:'alice',complete:async(m,o)=>{
        const packet=JSON.parse(m[1].content.split('EVIDENCE:\n')[1]);
        assert.doesNotMatch(packet.bundle.files[0].source,/extractParams/);
        assert(packet.bundle.coverage.omittedSymbols.some(s=>s.name==='extractParams'));
        return JSON.stringify({claims:[{text:'Counts characters.',evidenceIds:[o.format.properties.claims.items.properties.evidenceIds.items.enum[0]]}],unknowns:[]});
    }});
    console.log('Symbol projection, helper closure, context retention and service integration passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
