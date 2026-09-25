const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {buildBundle}=require('../src/reasoning/sourceBundle');
const {buildFunctionRecords}=require('../src/reasoning/functionBehavior');
const {completionReport,exactOutcome}=require('../src/reasoning/functionCompletion');
async function analyze(body,params='',prefix=''){
    const text=`${prefix}function f(${params}){${body}}`;
    const source={path:'src/completion.js',complete:true,version:crypto.createHash('sha256').update(text).digest('hex'),text:'1: '+text};
    const bundle=(await buildBundle(source,{maxChars:60000})).bundle;
    return buildFunctionRecords(bundle).records.find(f=>f.name==='f');
}
async function main(){
    const outcome=async(body)=> (await analyze(body)).completion.paths;
    assert.deepEqual((await outcome('return "Count: 3";'))[0].result,{type:'string',value:'Count: 3'});
    assert.deepEqual((await outcome('const value=3; return value;'))[0].result,{type:'number',value:'3'});
    assert.equal((await outcome('return;'))[0].result.type,'undefined');
    assert.equal((await outcome(''))[0].kind,'fallthrough');
    assert.equal((await outcome('throw "bad";'))[0].kind,'throw');
    const caught=await outcome('try { throw "bad"; } catch(error) { return "recovered"; }');
    assert.equal(caught[0].kind,'return');assert.equal(caught[0].result.value,'recovered');assert.equal(caught[0].handledExitIds.length,1);
    assert.equal((await outcome('try {throw "bad";} catch(error){throw error;}'))[0].kind,'throw');
    const replaced=await outcome('try {return 1;} finally {return 2;}');
    assert.equal(replaced[0].result.value,'2');assert.equal(replaced[0].overriddenExitIds.length,1);
    assert.equal((await outcome('try {throw "bad";} finally {return 2;}'))[0].kind,'return');
    assert.equal((await outcome('try {return 1;} finally {throw "final";}'))[0].kind,'throw');
    assert.equal((await outcome('try {return 1;} finally {}'))[0].result.value,'1');
    assert.equal((await outcome('try {unknown();} finally {return 2;}'))[0].kind,'unresolved');
    assert.equal((await outcome('try {return unknown();} catch(e){return "error";}'))[0].kind,'unresolved');
    for(const body of ['while(true){}','switch(x){case 1:return 1;}','return obj.value;','try {const x=1;} finally {} return x;','try {throw 1;} catch(e){} return e;','const x=1; {return x; let x=2;}','const x=1; {return x; function x(){}}'])assert.equal((await outcome(body))[0].kind,'unresolved');
    const choice=await analyze('if(flag) return 1; return 2;','flag');
    assert.equal(choice.completion.paths.length,2);assert(choice.completion.paths.every(p=>p.conditions.length===1));
    assert.equal((await analyze('return 1;','x=unknown()')).completion.status,'partial');
    assert.equal((await analyze('throw "bad";','','async ')).completion.boundary,'async_body_completion_not_promise_settlement');
    const report=completionReport(await analyze('return unknown();'));
    assert.equal(report.outcomes[0].meaning,'No final outcome established.');
    assert.deepEqual(exactOutcome(await analyze('const count=3; return `Word count: ${count}`;')).result,{type:'string',value:'Word count: 3'});
    assert.equal(exactOutcome(await analyze('return "Word count: 3";')).result.type,'string');
    assert.equal(exactOutcome(await analyze('if(flag) return 1; return 2;','flag')).status,'unresolved');
    assert.equal(exactOutcome(await analyze('return 3;','','async ')).kind,'resolve');
    assert.equal(exactOutcome(await analyze('try {throw "bad";} catch(e){return "caught";}')).kind,'return');
    assert.equal(exactOutcome(await analyze('throw "bad";')).kind,'throw');
    console.log('Bounded completion: returns, throws, catch, finally overrides, scope restoration and unknown boundaries passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
