const { test } = require('node:test');
const assert = require('node:assert/strict');
const intent = require('../src/integrations/espnFantasyIntent');
test('explicit commands bypass model; follow-ups get bounded conversation context', async () => {
    const never = async () => { throw new Error('Must not run'); };
    assert.deepEqual(await intent.resolve('Fantasy NBA: league injuries', [], { interpret: never }), { kind: 'read', actions: ['league_injuries'] });
    assert.deepEqual(await intent.resolve('Fantasy NBA: lineup next', [], { interpret: never }), { kind:'read',actions:['optimize_lineup'],parameters:{window:'next'} });
    assert.equal(await intent.resolve('Hello there', [], { interpret: never }), null);
    assert.equal(await intent.resolve("Don't check my fantasy league", [], { interpret: never }), null);
    assert.equal(await intent.resolve('Forget basketball. Show baseball standings.', [{ role: 'assistant', content: 'ESPN basketball roster' }], { interpret: never }), null);
    const history = [{ role: 'user', content: 'Check my fantasy basketball roster' }, { role: 'assistant', content: 'ESPN roster for Jitters' }];
    let payload;
    const result = await intent.resolve('Who else is hurt?', history, { completion: async messages => {
        payload = { recentConversation: messages.slice(1, -1), currentMessage: messages.at(-1).content };
        return '{"kind":"read","actions":["league_injuries"]}';
    } });
    assert.deepEqual(payload.recentConversation, history);
    assert.equal(payload.currentMessage, 'Who else is hurt?');
    assert.deepEqual(result.actions, ['league_injuries']);
    assert.equal(intent.shouldInterpret('Who else is hurt?', []), false);
    assert.equal(intent.recentContext(Array(20).fill({ role: 'user', content: 'x'.repeat(5000) })).length, 6);
});
test('trade parameters require grounded names and propagate explicit time windows',async()=>{
    const result=await intent.resolve('Would giving Harden for Hart improve my fantasy team next week?',[],{
        interpret:async()=>({kind:'read',actions:['evaluate_trade'],parameters:{window:'next',give:['Harden'],receive:['Hart']}})
    });
    assert.equal(result.parameters.window,'next');
    assert.deepEqual(result.parameters.receive,['Hart']);
    const invented=await intent.resolve('Compare trades in my fantasy league',[],{
        interpret:async()=>({kind:'read',actions:['evaluate_trade'],parameters:{give:['Harden'],receive:['Hart']}})
    });
    assert.equal(invented.kind,'clarify');
});
test('invalid outputs and failures cannot execute or claim missing access', async () => {
    for (const response of [null, { kind: 'read', actions: ['trade'] }, { kind: 'read', actions: [] },
        { kind: 'other', actions: ['roster'] }, { kind: 'read', actions: ['injuries'], extra: 'ignored' }]) {
        const result = await intent.resolve('Check my fantasy league', [], { interpret: async () => response });
        if (response?.extra) assert.deepEqual(result.actions, ['injuries']);
        else { assert.equal(result.kind, 'clarify'); assert.deepEqual(result.actions, []); }
    }
    const failed = await intent.resolve('Show my fantasy team', [], { interpret: async () => { throw new Error('offline'); } });
    assert.match(failed.reply, /interpret/);
    assert.doesNotMatch(failed.reply, /do not have access/);
    assert.equal(await intent.resolve('Explain fantasy basketball rules', [], { interpret: async () => ({ kind: 'other', actions: [] }) }), null);
});
test('period overrides require current-message time evidence, not stale history',async()=>{
    const history=[{role:'user',content:'Build my fantasy lineup for next week.'}];
    const complete=evidence=>async()=>JSON.stringify({meaning:'Forecast',actions:['forecast'],
        parameters:{windowEvidence:evidence,window:'next',give:[],receive:[]}});
    for(const evidence of ['', 'next week']) {
        const result=await intent.resolve('Forecast my fantasy matchup.',history,{completion:complete(evidence)});
        assert.deepEqual(result,{kind:'read',actions:['forecast']});
    }
    const explicit=await intent.resolve('Forecast my fantasy matchup next week.',history,{completion:complete('next week')});
    assert.equal(explicit.kind,'unsupported');
    const reference=await intent.resolve('Forecast it for that same week.',history,{completion:complete('that same week')});
    assert.equal(reference.kind,'unsupported');
});
