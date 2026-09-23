// Fixed author-written scenarios and oracles. Never execute model-authored code.
const assert=require('node:assert/strict');
const {createAgentProfileStore,validateProfile}=require('../../src/agents/agentProfiles');
const {atlasState}=require('../../src/core/atlasState');
const cases=[
    {id:'incomplete-profile',symbol:'validateProfile',scenario:"Call validateProfile({identity:{name:'John',role:'Developer'}, inspiration:'Innovation', traits:['Adaptable']}).",expected:{error:'Invalid agent profile shape'}},
    {id:'valid-looking-unknown',symbol:'get',scenario:"Create a fresh store with seeds:{}, ttlMs:30000, now:()=>0. Database maybeSingle resolves {data:null,error:{code:'offline'}}. Await get('invalid').",expected:{error:'Profile unavailable for agent invalid; refusing to substitute another agent'}},
    {id:'fresh-cache',symbol:'get',scenario:"At clock 0, get('alice') successfully loaded a valid database profile revision 7. ttlMs is 30000. At clock 29999, call get('alice') again; database would fail with code offline if called. Give source/degraded/revision and number of database calls during this SECOND get.",expected:{source:'database',degraded:false,revision:7,calls:0}},
    {id:'exact-expiry',symbol:'get',scenario:"At clock 0, get('alice') successfully loaded a valid database profile revision 7. ttlMs is 30000. At clock 30000, call get('alice') again; database resolves {data:null,error:{code:'offline'}}. Give source/degraded/revision and database calls during this SECOND get.",expected:{source:'cached_database',degraded:true,revision:7,calls:1}},
    {id:'seed-expiry',symbol:'get',scenario:"Store seeds:{alice:validProfile}, ttlMs:30000. Database always resolves {data:null,error:{code:'offline'}}. At clock 0 await get('alice'), then at clock 30000 await get('alice') again. Give source/degraded/revision and database calls during this SECOND get.",expected:{source:'seed_fallback',degraded:true,revision:null,calls:1}}
];
async function oracle(c) {
    if(c.id==='incomplete-profile') {let actual;assert.throws(()=>validateProfile({identity:{name:'John',role:'Developer'},inspiration:'Innovation',traits:['Adaptable']}),error=>{actual={error:error.message};return error.message===c.expected.error;});return actual;}
    let clock=0,calls=0,fail=c.id==='seed-expiry'||c.id==='valid-looking-unknown';
    const client={from(){return {select(){return {eq(){return {async maybeSingle(){calls++;return fail?{data:null,error:{code:'offline'}}:{data:{agent_id:'alice',schema_version:1,revision:7,profile:atlasState},error:null};}};}};}};}};
    const store=createAgentProfileStore({client,seeds:c.id==='valid-looking-unknown'?{}:{alice:atlasState},now:()=>clock,ttlMs:30000});
    if(c.id==='valid-looking-unknown'){let actual;await assert.rejects(store.get('invalid'),error=>{actual={error:error.message};return error.message===c.expected.error;});return actual;}
    await store.get('alice');calls=0;fail=true;clock=c.id==='fresh-cache'?29999:30000;
    const result=await store.get('alice');
    const actual={source:result.source,degraded:result.degraded,revision:result.revision,calls};
    assert.deepEqual(actual,c.expected);return actual;
}
module.exports={cases,oracle};
