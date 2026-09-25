const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {buildBundle,bindClaims}=require('../src/reasoning/sourceBundle');
const make=(path,text)=>({path,version:crypto.createHash('sha256').update(text).digest('hex'),complete:true,text:text.split('\n').map((s,i)=>`${i+1}: ${s}`).join('\n')});
async function build(main,dependency='function implementation(x){ return x; }\nmodule.exports={helper:implementation};'){
    const root=make('src/main.js',main),dep=make('src/dep.js',dependency);
    return (await buildBundle(root,{maxChars:30000,read:async p=>{if(p===dep.path)return dep;if(p===root.path)return root;throw new Error('missing');}})).bundle;
}
const links=b=>b.facts.filter(f=>f.rule==='unique-unwritten-top-level-call-binding');
async function main(){
    const text="const {helper: local}=require('./dep');\nfunction f(x){if(!x)return null; return local(x);}";
    const bundle=await build(text);
    assert.equal(links(bundle).length,1);assert.match(links(bundle)[0].expression,/src\/dep.js/);
    assert.equal(bundle.facts.filter(f=>f.rule==='direct-guard-return-skips-later-statements').length,1);
    const refs=links(bundle)[0].relatedIds.map(id=>bundle.facts.find(f=>f.id===id));
    assert.equal(refs[0].kind,'call');assert.equal(refs[1].kind,'function');
    assert.equal(bindClaims({claims:[{text:'Bound call.',evidenceIds:[links(bundle)[0].id]}]},bundle)[0].status,'MODEL_INFERRED');
    const cited=bindClaims({claims:[{text:'Bound call.',evidenceIds:[links(bundle)[0].id]}]},bundle)[0].citations;
    assert(cited.some(c=>c.path==='src/dep.js'));
    assert(cited.some(c=>c.path==='src/main.js'));
    assert.equal(links(await build(text.replace('f(x)','f(local)'))).length,0);
    assert.equal(links(await build(text+'\nlocal = other;')).length,0);
    assert.equal(links(await build(text+'\n({local}=other);')).length,0);
    assert.equal(links(await build(text+'\neval(code);')).length,0);
    assert.equal(links(await build(text+'\nconst another = function local(){return local();};')).length,0);
    assert.equal(links(await build(text,'function implementation(){}; module.exports={helper:implementation}; module.exports.helper=other;')).length,0);
    assert.equal(links(await build(text,'function implementation(){}; module.exports={...other,helper:implementation};')).length,0);
    assert.equal(links(await build(text.replace('helper: local','missing: local'))).length,0);
    assert.equal(links(await build('function helper(x){return x;} function run(){return helper(2);}')).length,1);
    const nested=await build('function run(x){if(x){function inner(){return 1;}} return 2;}');
    assert.equal(nested.facts.filter(f=>f.rule==='direct-guard-return-skips-later-statements').length,0);
    const actual=await buildBundle(require('../src/core/sourceReader').readRange('src/utils/unitConversionRequest.js',1,200));
    assert(actual.bundle.facts.some(f=>f.rule==='unique-unwritten-top-level-call-binding'&&f.expression.includes('normalizeArithmeticExpression')));
    assert(actual.bundle.facts.some(f=>f.rule==='direct-guard-return-skips-later-statements'&&f.span.line===9));
    console.log('Static relation aliases, source links, guard scope and conservative exclusions passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
