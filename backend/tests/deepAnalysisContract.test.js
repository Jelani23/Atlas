const assert=require('node:assert/strict');
const contract=require('../src/reasoning/deepAnalysisContract');
const packet={cacheKey:'key',sources:[{path:'src/a.js',version:'v',source:'1: function a(){ return "<think>literal</think>"; }'}]};
const answer=()=>({claims:[{kind:'behavior',text:'Returns the literal string.',assumptions:[],citations:[{path:'src/a.js',line:1}]}],unknowns:[],examples:[]});
assert.deepEqual(JSON.parse(contract.serializeEvidence(packet)),packet);
assert(!contract.serializeEvidence(packet).includes('<think>'));
const view=contract.sourceView({...packet,rootId:'r',nodes:[],edges:[],omissions:[],unresolvedDependencies:[]});
assert.deepEqual(view.sources,packet.sources);
assert.equal(view.packetKey,'key');
const bounded=contract.formatFor(packet);
assert.deepEqual(bounded.properties.claims.items.properties.citations.items.properties.path.enum,['src/a.js']);
assert.deepEqual(bounded.properties.examples.items.properties.citations.items.properties.line.enum,[1]);
assert.equal(contract.format.properties.claims.items.properties.citations.items.properties.path.enum,undefined);
const parsed=contract.parse(JSON.stringify(answer()),packet);
assert.equal(parsed.status,'unverified');assert.equal(parsed.claims[0].status,'MODEL_INFERRED');assert.equal(parsed.claims[0].citations[0].version,'v');
for(const mutate of [a=>a.claims[0].citations[0].line=2,a=>a.claims[0].citations[0].path='src/missing.js',a=>a.claims[0].status='VERIFIED',a=>a.claims=[],a=>a.claims[0].text='',a=>a.unknowns=[{kind:'invented',detail:'x',neededEvidence:'y'}],a=>a.claims[0].assumptions=null]){
    const a=answer();mutate(a);assert.throws(()=>contract.parse(JSON.stringify(a),packet));
}
assert.throws(()=>contract.parse('Draft\n'+JSON.stringify(answer()),packet));
assert.throws(()=>contract.parse('PRIVATE_DRAFT_DO_NOT_ECHO',packet),e=>e.message==='Invalid deep analysis JSON.');
assert.throws(()=>contract.parse('null',packet));
// Analyzer capabilities are host diagnostics, never a model-owned source gap.
for(const kind of ['missing_source','runtime_state']){
    const a=answer();a.unknowns=[{kind,detail:'The caller is not supplied.',blockedConclusion:'Which input did the caller pass?',neededEvidence:'The call site or recorded argument.'}];
    assert.equal(contract.parse(JSON.stringify(a),packet).unknowns[0].blockedConclusion,a.unknowns[0].blockedConclusion);
    delete a.unknowns[0].blockedConclusion;
    assert.throws(()=>contract.parse(JSON.stringify(a),packet),/fields/);
}
const analyzerUnknown=answer();analyzerUnknown.unknowns=[{kind:'analyzer_limit',detail:'No path feasibility.',blockedConclusion:'What does the code do?',neededEvidence:'Runtime logs.'}];
assert.throws(()=>contract.parse(JSON.stringify(analyzerUnknown),packet),/kind/);
const a=answer();a.claims[0].text='The literal </think> is source data.';
assert.equal(contract.parse(JSON.stringify(a),packet).claims[0].text,a.claims[0].text);
for(const input of ['', '   ']){
    const a=answer();a.examples=[{input,predictedOutcome:'',reason:'An explicit empty result.',citations:[{path:'src/a.js',line:1}]}];
    assert.equal(contract.parse(JSON.stringify(a),packet).examples[0].input,input);
}
console.log('Deep analysis contract: schema, citations, unverified provenance and reversible source encoding passed.');
