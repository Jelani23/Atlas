const {test}=require('node:test');
const assert=require('node:assert/strict');
const math=require('../src/integrations/espnFantasyAnalysis');
const {snapshot,player}=require('./fixtures/fantasySnapshot');
test('weekly calendar uses opening week, current/next periods and rejects disagreement',()=>{
    const s=snapshot();
    assert.equal(math.windowFor(s).start,'2026-11-02');
    assert.equal(math.windowFor(s).end,'2026-11-08');
    assert.equal(math.windowFor(s,'next').start,'2026-11-09');
    const bad=snapshot();bad.currentScoringPeriods=[1];
    assert.throws(()=>math.windowFor(bad),/disagree/);
    const playoff=snapshot();playoff.settings.scheduleSettings.matchupPeriods[4]=[4,5];
    assert.equal(math.windowFor(playoff,'next').dates.size,14);
});
test('exact optimizer handles flexible positions better than greedy selection',()=>{
    const s=snapshot(), result=math.optimize(s,s.teams[0]);
    assert.equal(result.low,360);
    assert.deepEqual(result.lineup.map(r=>[r.slot,r.player.playerId]).sort(),[['C',1],['PG',2]]);
    assert.equal(new Set(result.lineup.map(r=>r.player.playerId)).size,2);
    assert.equal(s.teams[0].roster[0].lineupSlot,'PG');
});
test('locked starters and locked bench stay put; next period resets locks but not IR',()=>{
    const s=snapshot();s.teams[0].roster[0].lineupLocked=true;s.teams[0].roster[1].lineupLocked=true;
    s.teams[0].roster.push({...player(9,'IR Star',100,['C'],'IR'),injuryStatus:'ACTIVE'});
    const current=math.optimize(s,s.teams[0]);assert.equal(current.low,320);
    assert.equal(current.lineup.find(r=>r.player.playerId===1).slot,'PG');
    assert(!current.lineup.some(r=>r.player.playerId===2||r.player.playerId===9));
    assert.equal(math.optimize(s,s.teams[0],'next').low,360);
});
test('injury scenarios respect estimated dates, no-timetable reports, and missing rates',()=>{
    const s=snapshot(), p={...s.teams[0].roster[0],injuryStatus:'OUT',expectedReturnDate:'2026-11-05'};
    const r=math.projection(p,s,math.windowFor(s));assert.equal(r.low,0);assert.equal(r.high,100);
    const uncertain=snapshot();const q={...p,returnTimetableUnconfirmed:true};
    assert.equal(math.projection(q,uncertain,math.windowFor(uncertain)).high,200);
    const missing=snapshot();missing.teams[0].roster[2].projectedAverage=null;missing.teams[0].roster[2].observedAverage=null;
    assert.deepEqual(math.optimize(missing,missing.teams[0]).missingRates,['Center Player']);
    assert.equal(math.rate({projectedAverage:0,observedAverage:50}).value,0);
});
test('forecast separates scores earned from future games and refuses incomplete final scenarios',()=>{
    const s=snapshot(), r=math.forecast(s);
    assert.deepEqual(r.ownFinal,[370,370]);assert.deepEqual(r.rivalFinal,[140,140]);
    assert.equal(r.neededAverage,16.25);assert.equal(r.incomplete,false);
    const done=snapshot();done.fetchedAt='2026-11-03T05:00:00Z';done.games.find(g=>g.id===14).completed=true;
    assert.equal(math.forecast(done).own.remainingGames,6);
    const live=snapshot();live.fetchedAt='2026-11-02T23:30:00Z';assert.equal(math.forecast(live).incomplete,true);
});
test('waivers and trades compare optimized lineups, leave rosters intact and validate ownership',()=>{
    const s=snapshot(), original=JSON.stringify(s), scout=math.waivers(s);
    assert.equal(scout.options[0].gain,80);
    const exchange=math.trade(s,[3],[4]);
    assert.equal(exchange.ownDelta,0); // A bench center removed, not a sum-of-averages loss.
    assert.equal(JSON.stringify(s),original);
    assert.throws(()=>math.trade(s,[6],[4]),/outgoing/);
    assert.throws(()=>math.trade(s,[1,2],[4]),/equal/);
    assert.throws(()=>math.trade(s,[1],[1]),/distinct/);
});
test('unsupported rules and unknown locks fail clearly',()=>{
    for(const change of [s=>s.scoringType='H2H_CATEGORY',s=>s.settings.rosterSettings.lineupLocktimeType='INDIVIDUAL_GAME',
        s=>delete s.teams[0].roster[0].lineupLocked,s=>s.settings.rosterSettings.lineupSlotStatLimits={11:{max:10}}]) {
        const s=snapshot();change(s);assert.throws(()=>math.optimize(s,s.teams[0]));
    }
});
test('hypothetical moves enforce reported roster position limits on both teams',()=>{
    const s=snapshot();
    for(const t of s.teams) for(const p of t.roster) p.defaultPositionId=p.eligibleSlots.includes('PG')?1:5;
    for(const p of s.freeAgents) p.defaultPositionId=5;
    s.settings.rosterSettings.positionLimits={1:2,5:1};
    assert.throws(()=>math.trade(s,[3],[4]),/position limit/);
    const options=math.waivers(s).options;
    assert(options.length>0);
    assert(options.every(o=>o.dropId===3));
    delete s.teams[0].roster[0].defaultPositionId;
    assert.throws(()=>math.waivers(s),/position IDs are missing/);
});
test('request-scoped snapshots are reused within a turn and never leak to another turn',async()=>{
    const {withSnapshot,fetchSnapshot}=require('../src/integrations/espnFantasy');
    let calls=0;const bridge=async()=>({id:++calls});const config={leagueId:1,season:2027,teamId:7,python:'python'};
    await withSnapshot(async()=>{const first=await fetchSnapshot(config,bridge);assert.equal(first,await fetchSnapshot(config,bridge));});
    await withSnapshot(async()=>{assert.equal((await fetchSnapshot(config,bridge)).id,2);});
});
test('all analysis views include source time and do not invent trade targets',()=>{
    const {analyze,resolveNames}=require('../src/integrations/espnAnalysisPresenter');const s=snapshot();
    for(const action of ['snapshot','league_analysis','optimize_lineup','forecast','waiver_scout','trade_scout']) assert.match(analyze(s,action),/Source snapshot checked/);
    assert.deepEqual(resolveNames(s,['Flexible Star'],7),[1]);
    assert.throws(()=>resolveNames(s,['Player']),/unique/);
    assert.match(analyze(s,'evaluate_trade',{give:['Center Player'],receive:['Rival Guard']}),/best starting lineup changes/);
});
test('analysis speech skips routine provenance and methodology but preserves results and warnings',()=>{
    const {analyze}=require('../src/integrations/espnAnalysisPresenter');
    const {formatImmediateToolReply,formatImmediateToolSpeech}=require('../src/response/toolResultPresenter');
    const s=snapshot();
    s.injuryDetailsNotice='Injury details unavailable; only fantasy injury flags are available.';
    const text=analyze(s,'optimize_lineup',{window:'next'});
    const route={toolName:'espnFantasy',toolResult:text};
    assert.equal(formatImmediateToolReply(route),text);
    assert.match(text,/Source snapshot checked/);
    assert.match(text,/Matchup period 4 \(next week\)/);
    assert.match(text,/These are deterministic scenarios/);
    const speech=formatImmediateToolSpeech(route);
    assert.doesNotMatch(speech,/Source snapshot checked|Collection took|Matchup period|These are deterministic scenarios|Healthy players use ESPN/);
    assert.match(speech,/For next week\./);
    assert.match(speech,/Injury details unavailable/);
    assert.match(speech,/Flexible Star/);
    assert.match(speech,/projected fantasy points/);
    const current=analyze(snapshot(),'optimize_lineup');
    assert.doesNotMatch(formatImmediateToolSpeech({toolName:'espnFantasy',toolResult:current}),/For next week|Injury details are from the ESPN public feed/);
    const multi={toolName:'multi_tool',toolResults:[{toolName:'espnFantasy',result:text,status:'complete'},
        {toolName:'readCode',result:'Source snapshot checked is a label in this code.',status:'complete'}]};
    assert.match(formatImmediateToolSpeech(multi),/Source snapshot checked is a label in this code/);
    assert.doesNotMatch(formatImmediateToolSpeech(multi),/Collection took/);
});
