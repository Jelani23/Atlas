// Pure deterministic calculations. No model, network, clock reads or mutations.
const SLOT_NAMES = { 0:'PG', 1:'SG', 2:'SF', 3:'PF', 4:'C', 5:'G', 6:'F', 7:'SG/SF', 8:'G/F', 9:'PF/C', 10:'F/C', 11:'UT' };
const finite = n => typeof n === 'number' && Number.isFinite(n);
const round = n => Math.round(n * 100) / 100;
const dayMs = 86400000;
const cache = new WeakMap();
function memo(snapshot) {
    if (!cache.has(snapshot)) cache.set(snapshot,{windows:new Map(),projections:new Map()});
    return cache.get(snapshot);
}
const injured = p => p.injured || (p.injuryStatus && !['ACTIVE','NORMAL','HEALTHY'].includes(p.injuryStatus));
function day(timestamp) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' })
        .formatToParts(new Date(timestamp)).map(p => [p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
const stamp = date => Date.parse(`${date}T00:00:00Z`);
function windowFor(snapshot, target = 'current') {
    if (memo(snapshot).windows.has(target)) return memo(snapshot).windows.get(target);
    if (!['current','next'].includes(target)) throw new Error('Choose current or next matchup period.');
    const calendar = snapshot.settings.scheduleSettings;
    if (calendar.periodTypeId !== 2) throw new Error('The analysis currently requires ESPN weekly matchup periods.');
    const first = snapshot.games.filter(g => g.scoringPeriod === snapshot.firstScoringPeriod && finite(g.startAt));
    if (!first.length) throw new Error('The season calendar is missing its first scoring day.');
    const start = stamp(day(Math.min(...first.map(g => g.startAt))));
    // ESPN weekly periods end Sunday; opening week may start midweek.
    const nextMonday = start + (8 - (new Date(start).getUTCDay() || 7)) * dayMs;
    const period = snapshot.matchupPeriod + (target === 'next' ? 1 : 0);
    const weeks = calendar.matchupPeriods?.[String(period)];
    if (!Array.isArray(weeks) || !weeks.length || weeks.some(w => !Number.isInteger(w) || w < 1)) throw new Error('ESPN did not provide that matchup period.');
    const dates = new Set();
    for (const week of weeks) {
        const from = week === 1 ? start : nextMonday + (week - 2) * 7 * dayMs;
        const to = week === 1 ? nextMonday : from + 7 * dayMs;
        for (let t = from; t < to; t += dayMs) dates.add(new Date(t).toISOString().slice(0,10));
    }
    if (target === 'current') {
        const known = snapshot.games.filter(g => snapshot.currentScoringPeriods.includes(g.scoringPeriod));
        if (known.some(g => !dates.has(day(g.startAt)))) throw new Error('ESPN matchup dates disagree with the weekly calendar; analysis is unavailable.');
    }
    const ordered = [...dates].sort();
    const result = { target, period, start:ordered[0], end:ordered.at(-1), dates };
    memo(snapshot).windows.set(target,result);
    return result;
}
function rate(p) {
    if (finite(p.projectedAverage)) return { value:p.projectedAverage, source:'ESPN projected season fantasy points per game' };
    if (finite(p.observedAverage)) return { value:p.observedAverage, source:'observed season average (projection unavailable)' };
    return { value:null, source:'missing' };
}
function projection(p, snapshot, window) {
    const key = `${window.period}:${p.playerId}`;
    if (memo(snapshot).projections.has(key)) return memo(snapshot).projections.get(key);
    const now = Date.parse(snapshot.fetchedAt);
    const games = snapshot.games.filter(g => (g.home === p.proTeamId || g.away === p.proTeamId) && window.dates.has(day(g.startAt)));
    const remaining = games.filter(g => g.startAt > now && !g.completed);
    const uncertainGames = games.filter(g => g.startAt <= now && !g.completed);
    const r = rate(p);
    const usableDate = /^\d{4}-\d{2}-\d{2}$/.test(p.expectedReturnDate || '') && !p.returnTimetableUnconfirmed;
    const optimistic = injured(p) && usableDate ? remaining.filter(g => day(g.startAt) >= p.expectedReturnDate) : remaining;
    // Bounds are explicit scenarios, never probabilities or clearance to play.
    const lowGames = injured(p) ? 0 : remaining.length;
    const highGames = injured(p) ? optimistic.length : remaining.length;
    const a = (r.value ?? 0) * lowGames, b = (r.value ?? 0) * highGames;
    const result = { playerId:p.playerId, name:p.name, rate:r.value, rateSource:r.source,
        scheduledGames:games.length, remainingGames:remaining.length, uncertainStartedGames:uncertainGames.length,
        low:Math.min(a,b), high:Math.max(a,b), injuryFlag:!!injured(p), missingRate:r.value === null,
        scheduleUnknown:p.proTeamId == null || !snapshot.games.some(g=>g.home===p.proTeamId || g.away===p.proTeamId) || games.some(g => g.startTimeTBD) };
    memo(snapshot).projections.set(key,result);
    return result;
}
function slots(snapshot) {
    const counts = snapshot.settings.rosterSettings.lineupSlotCounts;
    const list = [];
    for (const [id, count] of Object.entries(counts || {})) {
        if (!Number.isInteger(count) || count < 0) throw new Error('Invalid lineup slot counts.');
        if (count && Number(id) < 12 && !SLOT_NAMES[id]) throw new Error('Unknown active lineup slot.');
        if (SLOT_NAMES[id]) for (let i=0; i<count; i++) list.push({ key:`${id}:${i}`, name:SLOT_NAMES[id] });
    }
    if (!list.length || list.length > 16) throw new Error('The lineup size is unsupported or missing.');
    if (Object.keys(snapshot.settings.rosterSettings.lineupSlotStatLimits || {}).length) throw new Error('Lineup game/stat limits require a different optimizer.');
    return list;
}
function check(snapshot) {
    if (snapshot.snapshotVersion !== 1 || !finite(Date.parse(snapshot.fetchedAt))) throw new Error('Invalid league snapshot.');
    if (snapshot.scoringType !== 'H2H_POINTS') throw new Error('Fantasy-point optimization requires a head-to-head points league; category optimization is not implemented.');
    if (snapshot.settings.rosterSettings.lineupLocktimeType !== 'FIRSTGAME_WEEKLY') throw new Error('This optimizer supports weekly first-game locks only.');
    slots(snapshot);
}
function validRoster(snapshot,roster) {
    const counts=new Map();
    for(const p of roster) counts.set(String(p.defaultPositionId),(counts.get(String(p.defaultPositionId))||0)+1);
    for(const [position,limit] of Object.entries(snapshot.settings.rosterSettings.positionLimits || {})) {
        if (limit>0 && roster.some(p=>p.defaultPositionId==null)) throw new Error('Roster position limits cannot be checked because position IDs are missing.');
        if (limit>0 && (counts.get(position)||0)>limit) return false;
    }
    return true;
}
function optimize(snapshot, team, target = 'current', { hypothetical = false } = {}) {
    check(snapshot);
    const window = windowFor(snapshot,target), allSlots = slots(snapshot);
    const roster = team.roster;
    if (roster.some(p=>p.rosterStatus && p.rosterStatus!=='NORMAL')) throw new Error('Pending roster changes prevent a reliable lineup calculation. Refresh after ESPN applies them.');
    if (new Set(roster.map(p=>p.playerId)).size !== roster.length) throw new Error('Duplicate player IDs in roster.');
    if (target === 'current' && !hypothetical && roster.some(p => typeof p.lineupLocked !== 'boolean')) throw new Error('Current lineup lock flags are missing.');
    const projections = new Map(roster.map(p => [p.playerId,projection(p,snapshot,window)]));
    const fixed = [], occupied = new Set(), excluded = new Set();
    for (const p of roster) {
        if (['IR','BE','BN'].includes(p.lineupSlot) && (p.lineupSlot === 'IR' || (target === 'current' && p.lineupLocked && !hypothetical))) excluded.add(p.playerId);
        if (target === 'current' && p.lineupLocked && !hypothetical && !['IR','BE','BN'].includes(p.lineupSlot)) {
            const index = allSlots.findIndex((s,i)=>s.name === p.lineupSlot && !occupied.has(i));
            if (index < 0) throw new Error('Locked lineup does not fit the reported slot counts.');
            occupied.add(index); excluded.add(p.playerId);
            fixed.push({ slot:allSlots[index].name, player:p, projection:projections.get(p.playerId), locked:true });
        }
    }
    const open = allSlots.filter((_,i)=>!occupied.has(i));
    let states = new Map([[0,{ low:0, high:0, picks:[] }]]);
    const better = (a,b) => !b || a.low > b.low || (a.low === b.low && a.high > b.high);
    for (const p of roster) {
        if (excluded.has(p.playerId)) continue;
        const eligible = open.map((s,i)=>(p.eligibleSlots || []).includes(s.name) ? i : -1).filter(i=>i>=0);
        const value = projections.get(p.playerId), next = new Map(states);
        for (const [mask, state] of states) for (const i of eligible) {
            if (mask & (1<<i)) continue;
            const candidate = { low:state.low+value.low, high:state.high+value.high,
                picks:[...state.picks,{ slot:open[i].name, player:p, projection:value, locked:false }] };
            const key = mask | (1<<i);
            if (better(candidate,next.get(key))) next.set(key,candidate);
        }
        states = next;
    }
    // Fill as many legal slots as possible, then maximize the conservative
    // scenario; upside breaks ties. No player can occupy two slots.
    const best = [...states.entries()].sort((a,b)=>b[1].picks.length-a[1].picks.length || b[1].low-a[1].low || b[1].high-a[1].high)[0][1];
    const lineup = [...fixed,...best.picks], selected = new Set(lineup.map(row=>row.player.playerId));
    const bench=roster.filter(p=>!selected.has(p.playerId));
    const reserves=bench.filter(p=>p.lineupSlot!=='IR');
    const depth={low:round(reserves.reduce((sum,p)=>sum+projections.get(p.playerId).low,0)),
        high:round(reserves.reduce((sum,p)=>sum+projections.get(p.playerId).high,0)),
        healthy:reserves.filter(p=>!injured(p)).length,
        coveredSlots:[...new Set(allSlots.filter(s=>reserves.some(p=>!injured(p)&&(p.eligibleSlots||[]).includes(s.name))).map(s=>s.name))]};
    const sum = key => lineup.reduce((s,row)=>s+row.projection[key],0);
    return { teamId:team.team_id, teamName:team.team_name, window:{...window,dates:undefined},
        low:round(sum('low')), high:round(sum('high')), remainingGames:sum('remainingGames'),
        uncertainStartedGames:sum('uncertainStartedGames'), missingRates:roster.filter(p=>projections.get(p.playerId).missingRate).map(p=>p.name),
        unknownSchedules:roster.filter(p=>projections.get(p.playerId).scheduleUnknown).map(p=>p.name),
        emptySlots:allSlots.length-lineup.length, lineup, bench, depth, hypothetical };
}
function teamFor(snapshot,id=snapshot.team?.team_id) {
    const team=snapshot.teams.find(t=>t.team_id===id);
    if (!team) throw new Error('Select a valid fantasy team before analysis.');
    return team;
}
function forecast(snapshot) {
    const team=teamFor(snapshot), match=snapshot.matchups.find(m=>m.homeId===team.team_id || m.awayId===team.team_id);
    if (!match) throw new Error('There is no current matchup for your team.');
    const home=match.homeId===team.team_id, opponent=teamFor(snapshot,home?match.awayId:match.homeId);
    const own=optimize(snapshot,team), rival=optimize(snapshot,opponent);
    const ownScore=home?match.homeScore:match.awayScore, opponentScore=home?match.awayScore:match.homeScore;
    if (![ownScore,opponentScore].every(finite)) throw new Error('Current matchup scores are unavailable.');
    const incomplete=own.uncertainStartedGames+rival.uncertainStartedGames>0 || own.missingRates.length+rival.missingRates.length>0 || own.unknownSchedules.length+rival.unknownSchedules.length>0;
    return { own, rival, ownScore, opponentScore, incomplete,
        ownFinal:[round(ownScore+own.low),round(ownScore+own.high)], rivalFinal:[round(opponentScore+rival.low),round(opponentScore+rival.high)],
        neededAverage:!incomplete && own.remainingGames ? round(Math.max(0,opponentScore+rival.high-ownScore)/own.remainingGames) : null };
}
function leagueAnalysis(snapshot,target='current') {
    const window=windowFor(snapshot,target);
    return snapshot.teams.map(team=>{
        const projection=optimize(snapshot,team,target);
        const flags=team.roster.filter(injured);
        const starters=flags.filter(p=>!['IR','BE','BN'].includes(p.lineupSlot));
        const lost=starters.reduce((sum,p)=>{const r=projectionFor(p);return sum + Math.max(0,r.high-r.low);},0);
        function projectionFor(p){return module.exports.projection(p,snapshot,window);}
        return { ...projection, injured:flags.length, injuredStarters:starters.length,
            injuredReserve:team.roster.filter(p=>p.lineupSlot==='IR').map(p=>p.name), atRiskPoints:round(lost) };
    }).sort((a,b)=>b.low-a.low || b.high-a.high);
}
function trade(snapshot,giveIds,receiveIds,target='next') {
    if (!giveIds.length || giveIds.length!==receiveIds.length || giveIds.length>3) throw new Error('Trade scenarios require one to three players on each side, with equal roster counts.');
    if (new Set([...giveIds,...receiveIds]).size!==giveIds.length+receiveIds.length) throw new Error('Trade players must be distinct.');
    const own=teamFor(snapshot);
    if (!giveIds.every(id=>own.roster.some(p=>p.playerId===id))) throw new Error('Every outgoing player must be on your roster.');
    const other=snapshot.teams.find(t=>t.team_id!==own.team_id && receiveIds.every(id=>t.roster.some(p=>p.playerId===id)));
    if (!other) throw new Error('Incoming players must belong to one other fantasy team.');
    const give=own.roster.filter(p=>giveIds.includes(p.playerId)), receive=other.roster.filter(p=>receiveIds.includes(p.playerId));
    const moved=players=>players.map(p=>({...p,lineupSlot:'BE',lineupLocked:false}));
    const before=optimize(snapshot,own,target,{hypothetical:true}), theirBefore=optimize(snapshot,other,target,{hypothetical:true});
    const ownRoster=[...own.roster.filter(p=>!giveIds.includes(p.playerId)),...moved(receive)], otherRoster=[...other.roster.filter(p=>!receiveIds.includes(p.playerId)),...moved(give)];
    if (!validRoster(snapshot,ownRoster)||!validRoster(snapshot,otherRoster)) throw new Error('This trade exceeds a reported roster position limit.');
    const after=optimize(snapshot,{...own,roster:ownRoster},target,{hypothetical:true});
    const theirAfter=optimize(snapshot,{...other,roster:otherRoster},target,{hypothetical:true});
    return { give:give.map(p=>p.name), receive:receive.map(p=>p.name), otherTeam:other.team_name,
        ownDelta:round(after.low-before.low), ownUpsideDelta:round(after.high-before.high),
        otherDelta:round(theirAfter.low-theirBefore.low), otherUpsideDelta:round(theirAfter.high-theirBefore.high),
        before, after, theirBefore, theirAfter, target, hypothetical:true };
}
function waivers(snapshot,target='next') {
    const team=teamFor(snapshot), before=optimize(snapshot,team,target,{hypothetical:true});
    const candidates=[];
    for (const add of snapshot.freeAgents) for (const drop of team.roster) {
        if (drop.droppable===false || drop.lineupSlot==='IR') continue;
        const roster=[...team.roster.filter(p=>p.playerId!==drop.playerId),{...add,lineupSlot:'BE',lineupLocked:false}];
        if (!validRoster(snapshot,roster)) continue;
        const after=optimize(snapshot,{...team,roster},target,{hypothetical:true});
        candidates.push({ add:add.name, drop:drop.name, addId:add.playerId, dropId:drop.playerId,
            gain:round(after.low-before.low), upsideGain:round(after.high-before.high), after });
    }
    return { before, target, examined:snapshot.freeAgents.length,
        options:candidates.sort((a,b)=>b.gain-a.gain || b.after.depth.low-a.after.depth.low || b.upsideGain-a.upsideGain).slice(0,5) };
}
function scoutTrades(snapshot,target='next') {
    const own=teamFor(snapshot), result=[];
    // Bounded shortlist by projected per-game production, not claims about
    // another manager's willingness to trade. Each pair is re-optimized.
    const shortlist=team=>[...team.roster].filter(p=>p.lineupSlot!=='IR').sort((a,b)=>(rate(b).value??0)-(rate(a).value??0)).slice(0,6);
    for (const other of snapshot.teams.filter(t=>t.team_id!==own.team_id)) {
        const options=[];
        for (const give of shortlist(own)) for (const receive of shortlist(other)) {
            const ownRoster=[...own.roster.filter(p=>p.playerId!==give.playerId),receive];
            const otherRoster=[...other.roster.filter(p=>p.playerId!==receive.playerId),give];
            if(validRoster(snapshot,ownRoster)&&validRoster(snapshot,otherRoster)) options.push(trade(snapshot,[give.playerId],[receive.playerId],target));
        }
        const best=options.filter(o=>o.ownDelta>0 && o.otherDelta>=0).sort((a,b)=>b.ownDelta-a.ownDelta)[0];
        if (best) result.push(best);
    }
    return result.sort((a,b)=>b.ownDelta-a.ownDelta).slice(0,5);
}
module.exports={windowFor,projection,optimize,forecast,leagueAnalysis,trade,waivers,scoutTrades,teamFor,rate,slots,check,day};
