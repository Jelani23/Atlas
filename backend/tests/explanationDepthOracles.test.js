const assert = require('node:assert/strict');
async function main() {
    async function get(cached, now, load) {
        if (cached && now-cached.loadedAt < 30000) return cached;
        return await load();
    }
    const cached={loadedAt:1000};
    let calls=0;
    const load=async()=>{calls++;throw new Error('offline');};
    assert.equal(await get(cached,30999,load),cached);
    assert.equal(calls,0);
    await assert.rejects(get(cached,31000,load),/offline/);
    await assert.rejects(get(cached,31001,load),/offline/);
    assert.equal(calls,2);
    function fallback(cached,seeds,id) {
        if (['database','cached_database'].includes(cached?.source)) return {...cached,source:'cached_database',degraded:true};
        if (Object.hasOwn(seeds,id)) return {source:'seed_fallback',profile:seeds[id],degraded:true};
        throw new Error('unavailable');
    }
    assert.equal(fallback({source:'database'},{},'bob').source,'cached_database');
    assert.equal(fallback({source:'seed_fallback'},{alice:{}},'alice').source,'seed_fallback');
    assert.throws(()=>fallback(null,{},'bob'),/unavailable/);
    const original={source:'database',profile:{name:'Alice'}};
    const snapshot={...original,source:'cached_database',degraded:true};
    assert.equal(original.source,'database');
    assert.equal(snapshot.profile,original.profile);
    const strings=value=>Array.isArray(value)&&value.every(x=>typeof x==='string'&&x.trim().length>0);
    assert.equal(strings([]),true);
    assert.equal(strings([' ']),false);
    const profiles=new Map([['alice',{nested:{value:1}}]]);
    const cloned=structuredClone(profiles.get('alice'));
    cloned.nested.value=2;
    assert.equal(profiles.get('alice').nested.value,1);
    console.log('Explanation depth oracles: early return, exact TTL, cache origin, shallow copy, empty arrays and clone isolation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
