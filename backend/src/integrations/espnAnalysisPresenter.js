const math = require('./espnFantasyAnalysis');
const { position } = require('./espnFantasyPresenter');
const n = value => Number(value).toLocaleString('en-US',{maximumFractionDigits:1});
const range = result => `${n(result.low)} to ${n(result.high)} projected fantasy points`;
const dateLabel = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
function lineage(snapshot, target) {
    return [`ESPN analysis for ${snapshot.team?.team_name || 'your league'} in ${snapshot.leagueName}.`,
        `Source snapshot checked ${new Date(snapshot.fetchedAt).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}. Collection took ${n((Date.parse(snapshot.fetchedAt)-Date.parse(snapshot.collectionStartedAt))/1000)} seconds.`,
        target ? `Matchup period ${target.period} (${target.target === 'next' ? 'next' : 'this'} week): ${dateLabel(target.start)} through ${dateLabel(target.end)}.` : '',
        'These are deterministic scenarios, not win probabilities. The conservative scenario gives injury-flagged players zero future games; the upside scenario allows games on or after a tentative return date, or all future games if no date is known. Healthy players use ESPN projected season fantasy points per game, with observed averages only when projections are missing.',
        snapshot.injuryDetailsNotice || 'Injury details are from the ESPN public feed when available; return estimates do not guarantee availability.'
    ].filter(Boolean);
}
function coverage(result) {
    return [result.missingRates.length ? `Missing rates (counted as zero): ${result.missingRates.join(', ')}.` : '',
        result.unknownSchedules.length ? `Uncertain schedules: ${result.unknownSchedules.join(', ')}.` : '',
        result.uncertainStartedGames ? `${result.uncertainStartedGames} started games lack final status; their remaining production is not projected.` : '',
        result.emptySlots ? `${result.emptySlots} starting slots could not be filled.` : '',
        result.lineup.some(row=>row.projection.rateSource.startsWith('observed')) ? 'Some players use observed averages because ESPN projections are missing.' : ''
    ].filter(Boolean).join(' ');
}
function lineup(result) {
    return [`${result.teamName}: ${range(result)} from ${result.remainingGames} future scheduled player-games.`,
        ...result.lineup.map(row=>`${position(row.slot)}: ${row.player.name}${row.locked?' (locked)':''}. ${row.projection.remainingGames} future games at ${n(row.projection.rate ?? 0)} projected points per game; ${n(row.projection.low)} to ${n(row.projection.high)} points${row.projection.injuryFlag?'; injury uncertainty':''}.`),
        `Not selected: ${result.bench.map(p=>p.name+(p.lineupSlot==='IR'?' (injured reserve)':'')).join(', ') || 'none'}.`,coverage(result)].filter(Boolean);
}
function resolveNames(snapshot,names,teamId) {
    const roster = snapshot.teams.filter(t=>teamId == null || t.team_id === teamId).flatMap(t=>t.roster);
    return names.map(name=>{
        const text = name.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
        const matches=roster.filter(p=>{
            const full=p.name.toLowerCase().replace(/[^a-z0-9 ]/g,'');
            return full===text || full.endsWith(` ${text}`);
        });
        if (matches.length!==1) throw new Error(`Please give a unique rostered player's full name for ${name}.`);
        return matches[0].playerId;
    });
}
function transactionNote(snapshot) {
    const rules=snapshot.settings.acquisitionSettings;
    return `Hypothetical roster comparison only. Existing weekly locks still apply; no transaction is submitted. ESPN's acquisition cap is ${rules.matchupAcquisitionLimit ?? 'unknown'} per ${rules.matchupLimitPerScoringPeriod?'scoring period':'matchup period'}, with ${rules.waiverHours ?? 'unknown'} waiver hours. Pending claims, available acquisition allowance, processing time, position limits, and trade approval must be checked in ESPN before acting. Trade deadline: ${snapshot.settings.tradeSettings.deadlineDate ? new Date(snapshot.settings.tradeSettings.deadlineDate).toISOString() : 'not supplied'}.`;
}
function tradeLines(result) {
    return [`Give ${result.give.join(' and ')}; receive ${result.receive.join(' and ')} from ${result.otherTeam}.`,
        `Your best starting lineup changes by ${n(result.ownDelta)} conservative points and ${n(result.ownUpsideDelta)} upside points.`,
        `Their best starting lineup changes by ${n(result.otherDelta)} conservative points and ${n(result.otherUpsideDelta)} upside points.`,
        `Your before/after: ${range(result.before)}, changing to ${range(result.after)}.`,
        `Your bench after: ${result.after.bench.map(p=>p.name).join(', ') || 'empty'}. Healthy non-IR reserves: ${result.before.depth.healthy} before, ${result.after.depth.healthy} after. Unused conservative bench production: ${n(result.before.depth.low)} before, ${n(result.after.depth.low)} after.`,
        `Bench eligibility covers: ${result.after.depth.coveredSlots.map(position).join(', ') || 'no active slots'}. These reserves are not counted in starting-lineup totals, and locked bench players cannot be substituted this week.`,coverage(result.after)].filter(Boolean);
}
function analyze(snapshot,action,parameters={}) {
    math.check(snapshot);
    const target = parameters.window || (['waiver_scout','trade_scout','evaluate_trade'].includes(action)?'next':'current');
    const window=math.windowFor(snapshot,target), own=math.teamFor(snapshot);
    const lines=lineage(snapshot,window);
    if (action==='snapshot' || action==='league_analysis') {
        const results=math.leagueAnalysis(snapshot,target);
        lines.push(`Unified snapshot contains ${snapshot.teams.length} teams, ${snapshot.teams.reduce((s,t)=>s+t.roster.length,0)} rostered players, ${snapshot.freeAgents.length} free-agent candidates, current matchups, standings, schedules, lock settings and injury details.`);
        lines.push('Teams ranked by conservative future starting-lineup production, not by win probability or final score:');
        results.forEach((r,i)=>lines.push(`${i+1}. ${r.teamName}: ${range(r)}; ${r.injured} injury flags, including ${r.injuredStarters} current starters. Up to ${n(r.atRiskPoints)} future points at risk on those starters. Injured reserve: ${r.injuredReserve.join(', ') || 'empty'}. ${coverage(r)}`));
        const affected=[...results].filter(r=>r.injured>0).sort((a,b)=>b.atRiskPoints-a.atRiskPoints || b.injuredStarters-a.injuredStarters || b.injured-a.injured);
        lines.push('Injury burden, ranked by the gap between conservative and upside production for currently assigned injured starters:');
        lines.push(...(affected.length ? affected.map((r,i)=>`${i+1}. ${r.teamName}: ${n(r.atRiskPoints)} uncertain future starter points; ${r.injuredStarters} injured starters and ${r.injured} roster injury flags. This measures exposure, not confirmed points lost.`) : ['No roster injury flags were reported.']));
    } else if (action==='optimize_lineup') {
        const result=math.optimize(snapshot,own,target);
        lines.push(target==='current'?'Current locked starters and locked bench players are preserved.':'Next-period planning assumes locks reset. It does not authorize moves before ESPN unlocks them.');
        lines.push('Assignment fills eligible starting slots, maximizes conservative projected production, then uses upside to break ties. Injured-reserve players are not automatically activated.',...lineup(result));
    } else if (action==='forecast') {
        if (target!=='current') throw new Error('Matchup forecasts currently use the current matchup only.');
        const r=math.forecast(snapshot);
        lines.push('Forecast assumes each team uses its conservative optimized lineup for any slots still unlocked, and preserves locked assignments. These are future-game production scenarios, not a live game-by-game predictive model.');
        lines.push(`${r.own.teamName}: ${n(r.ownScore)} actual points; ${range(r.own)} from future games.`,
            `${r.rival.teamName}: ${n(r.opponentScore)} actual points; ${range(r.rival)} from future games.`);
        if (r.incomplete) lines.push('A complete final-score forecast is unavailable because of started games without final status, missing rates, or uncertain schedules. These future-game totals exclude unfinished portions of games already started.');
        else lines.push(`Final-score scenarios: ${r.ownFinal.map(n).join(' to ')} for you; ${r.rivalFinal.map(n).join(' to ')} for your opponent.`,
            r.neededAverage===null?'No future starting-player games remain; there is no per-game break-even calculation.':`To tie the opponent's upside scenario, your ${r.own.remainingGames} future starting-player games would need to average ${n(r.neededAverage)} points each. Winning requires more.`);
        lines.push(coverage(r.own),coverage(r.rival));
    } else if (action==='waiver_scout') {
        const r=math.waivers(snapshot,target);
        lines.push(transactionNote(snapshot),`Baseline: ${range(r.before)}. Checked ${r.examined} available candidates, not the entire player pool.`);
        if (!r.options.length) lines.push('No valid one-for-one add/drop comparisons were available.');
        for (const o of r.options) lines.push(`Add ${o.add}, drop ${o.drop}: ${n(o.gain)} conservative point change; ${n(o.upsideGain)} upside point change in the best legal starting-slot assignment. Healthy non-IR reserves after: ${o.after.depth.healthy}; unused conservative bench production: ${n(o.after.depth.low)} points. ${coverage(o.after)}`);
    } else if (action==='evaluate_trade') {
        if (!parameters.give?.length || !parameters.receive?.length) throw new Error('Name the players you would give and the players you would receive.');
        const r=math.trade(snapshot,resolveNames(snapshot,parameters.give,own.team_id),resolveNames(snapshot,parameters.receive),target);
        lines.push(transactionNote(snapshot),...tradeLines(r));
    } else if (action==='trade_scout') {
        const options=math.scoutTrades(snapshot,target);
        lines.push(transactionNote(snapshot),'Scouting compares one-for-one swaps among the six highest projected-average non-IR players on each team. It favors improved conservative production for you without reducing the other team’s. This does not predict another manager’s willingness to trade.');
        if (!options.length) lines.push('No mutually non-worsening conservative lineup swap was found in this bounded shortlist.');
        for (const r of options) lines.push(...tradeLines(r));
    } else throw new Error('Unknown analysis action.');
    return lines.filter(Boolean).join('\n\n');
}
module.exports={analyze,resolveNames};
