// Basketball-specific vocabulary belongs here, not in global speech replacement
// rules (C, PF, and team abbreviations can mean other things outside basketball).
const TEAMS = {
    ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets',
    CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
    DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
    GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
    LAC: 'Los Angeles Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
    MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
    NOP: 'New Orleans Pelicans', NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder',
    ORL: 'Orlando Magic', PHL: 'Philadelphia 76ers', PHI: 'Philadelphia 76ers',
    PHO: 'Phoenix Suns', PHX: 'Phoenix Suns', POR: 'Portland Trail Blazers',
    SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs', TOR: 'Toronto Raptors',
    UTA: 'Utah Jazz', WAS: 'Washington Wizards', FA: 'no current professional team'
};
const POSITIONS = { PG: 'point guard', SG: 'shooting guard', SF: 'small forward',
    PF: 'power forward', C: 'center', G: 'guard', F: 'forward', UT: 'utility',
    UTIL: 'utility', BE: 'bench', BN: 'bench', IR: 'injured reserve', Rookie: 'rookie' };
const STATS = { PTS: 'points', BLK: 'blocks', STL: 'steals', AST: 'assists',
    REB: 'rebounds', OREB: 'offensive rebounds', DREB: 'defensive rebounds',
    TO: 'turnovers', '3PM': 'three-pointers made', '3PA': 'three-point attempts',
    FGM: 'field goals made', FGA: 'field goal attempts', FTM: 'free throws made',
    FTA: 'free throw attempts', 'FG%': 'field goal percentage', 'FT%': 'free throw percentage',
    '3PT%': 'three-point percentage', MIN: 'minutes', GP: 'games played', PF: 'personal fouls' };
const readable = value => String(value || 'unknown').toLowerCase().replace(/_/g, ' ');
const position = value => value ? String(value).split('/').map(p => POSITIONS[p] || readable(p)).join(' or ') : 'position unavailable';
const number = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'unavailable';
const count = (n, singular, plural = `${singular}s`) => `${number(n)} ${n === 1 ? singular : plural}`;
function record(team) {
    return `${count(team.wins, 'win')}, ${count(team.losses, 'loss', 'losses')}${team.ties ? `, and ${count(team.ties, 'tie')}` : ''}`;
}
function stats(values) {
    return Object.entries(values || {}).map(([key, raw]) => {
        const value = raw && typeof raw === 'object' ? raw.value : raw;
        return `${STATS[key] || readable(key)}: ${number(value)}`;
    }).join(', ');
}
function playerLine(player, scoring, available = false) {
    const team = TEAMS[player.proTeam] || 'an unrecognized professional team';
    let text = `${player.name}, ${position(player.position)} for ${team}.`;
    if (!available) {
        const slot = player.lineupSlot;
        if (['BE', 'BN'].includes(slot)) text += ' On your bench.';
        else if (slot === 'IR') text += ' In your injured reserve slot.';
        else if (slot && slot !== player.position) text += ` In your ${position(slot)} slot.`;
    }
    const status = readable(player.injuryStatus);
    if (player.injuryStatus === 'DAY_TO_DAY') text += ' Listed as day-to-day.';
    else if (player.injuryStatus && !['ACTIVE', 'NORMAL', 'HEALTHY'].includes(player.injuryStatus)) text += ` Listed as ${status}.`;
    else if (player.injured) text += ' Flagged as injured by ESPN.';
    else if (!player.injuryStatus) text += ' Injury status unavailable.';
    if (scoring === 'H2H_POINTS' && typeof player.avg_points === 'number') text += ` Averaging ${number(player.avg_points)} fantasy points per game.`;
    else if (scoring !== 'H2H_POINTS' && player.season_stats) text += ` Season averages: ${stats(player.season_stats)}.`;
    return text;
}
function injuryTimeline(player, fetchedAt) {
    const flagged = player.injured || (player.injuryStatus && !['ACTIVE', 'NORMAL', 'HEALTHY'].includes(player.injuryStatus));
    if (!flagged) return '';
    const raw = player.expectedReturnDate;
    const date = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return ' Return timeline not provided by ESPN.';
    const label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    if (player.returnTimetableUnconfirmed) return ` The latest ESPN report leaves the return timetable unconfirmed. Its listed date of ${label} is tentative.`;
    const fetched = new Date(fetchedAt);
    if (!Number.isFinite(fetched.getTime())) return ` ESPN estimates a return on ${label}; this is not confirmed clearance to play.`;
    // Compare calendar dates in the same local timezone used by the report's
    // checked-at label; an upstream date-only value must not shift a day in TTS.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(fetched).map(p => [p.type, p.value]));
    const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    const days = Math.round((date.getTime() - today) / 86400000);
    if (days < 0) return ` ESPN's estimated return date was ${label}, which has passed. An updated return timeline is unavailable.`;
    return ` ESPN estimates a return ${days === 0 ? 'today' : `on ${label}, in ${count(days, 'day')}`}; this is not confirmed clearance to play.`;
}
function displayPlayer(player, scoring, available = false, fetchedAt) {
    const details = scoring === 'H2H_POINTS' && typeof player.avg_points === 'number'
        ? ` Averaging ${number(player.avg_points)} fantasy points per game.`
        : scoring !== 'H2H_POINTS' && player.season_stats ? ` Season averages: ${stats(player.season_stats)}.` : '';
    const updated = new Date(player.injuryUpdatedAt);
    const reason = player.injuryReason ? ` ESPN lists: ${player.injuryReason}.` : '';
    const update = player.injuryUpdatedAt && Number.isFinite(updated.getTime())
        ? ` Injury report updated ${updated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : '';
    return `${player.name} — ${player.proTeam || 'unknown'}, ${player.position || 'unknown'}${available ? '' : `; slot: ${player.lineupSlot || 'unassigned'}`}; status: ${player.injuryStatus || (player.injured ? 'INJURED' : 'unknown')}.${reason}${injuryTimeline(player, fetchedAt)}${update}${details}`;
}
// Only transform the structured player rows emitted above. Never replace short
// tokens globally: C in code or a fantasy team named BOS must stay unchanged.
function formatSpeech(text) {
    let spoken = String(text);
    // Analysis provenance and methodology stay visible, but do not precede
    // every spoken answer. Preserve actual data-quality warnings and findings.
    if (/^ESPN analysis for /m.test(spoken)) {
        spoken = spoken.split(/\r?\n\s*\r?\n/).flatMap(paragraph => {
            if (/^Source snapshot checked /.test(paragraph)
                || /^These are deterministic scenarios, not win probabilities\./.test(paragraph)
                || paragraph === 'Injury details are from the ESPN public feed when available; return estimates do not guarantee availability.') return [];
            if (/^Matchup period \d+(?: \((?:this|next) week\))?: /.test(paragraph)) {
                return paragraph.includes('(next week)') ? ['For next week.'] : [];
            }
            return [paragraph];
        }).join('\n\n');
    }
    return spoken.replace(/^(.+?) — ([A-Z]+|unknown), ([A-Za-z/]+)(?:; slot: ([A-Za-z/]+))?; status: ([A-Z_]+|unknown)\.(.*)$/gm,
        (_row, name, proTeam, playerPosition, slot, status, details) => {
            const player = { name, proTeam, position: playerPosition === 'unknown' ? null : playerPosition,
                lineupSlot: slot === 'unassigned' ? null : slot, injuryStatus: status === 'unknown' ? null : status };
            return playerLine(player, 'H2H_POINTS', !slot || slot === 'unassigned') + details;
        });
}
function matchupLine(match, data) {
    const ownHome = data.team?.team_id != null && data.team.team_id === match.home.team_id;
    const ownAway = data.team?.team_id != null && data.team.team_id === match.away.team_id;
    const first = ownAway ? match.away : match.home;
    const second = ownAway ? match.home : match.away;
    const a = ownAway ? 'away' : 'home', b = ownAway ? 'home' : 'away';
    if (first.team_name === 'BYE' || second.team_name === 'BYE') return `${data.team?.team_name || first.team_name} has a bye this matchup period.`;
    if (first[`${a}_stats`] != null) {
        return `${first.team_name} against ${second.team_name}: ${count(first[`${a}_wins`], 'category win')}, ${count(first[`${a}_losses`], 'category loss', 'category losses')}, and ${count(first[`${a}_ties`], 'tie')}.\n${first.team_name}: ${stats(first[`${a}_stats`]) || 'category statistics unavailable'}.\n${second.team_name}: ${stats(second[`${b}_stats`]) || 'category statistics unavailable'}.`;
    }
    const score = first[`${a}_score`], other = second[`${b}_score`];
    let text = `${first.team_name} has ${number(score)} points against ${second.team_name}, with ${number(other)} points.`;
    if ((ownHome || ownAway) && typeof score === 'number' && typeof other === 'number') {
        text += score === other ? ' The score is tied.' : ` ${score > other ? 'Ahead' : 'Behind'} by ${number(Math.abs(score - other))} points.`;
    }
    if (match.winner === 'UNDECIDED') text += ' No winner has been declared yet.';
    return text;
}
function playedGamesLines(report) {
    const value = result => !result.days ? 'unavailable' : `${result.count}${result.complete ? '' : ' confirmed (partial)'}`;
    const rows=[...report.teams].sort((a,b)=>b.season.count-a.season.count || a.team_name.localeCompare(b.team_name));
    const lines=['Actual active player-games:',
        `Season to date, this week (matchup ${report.currentMatchupPeriod}), and last week (matchup ${report.currentMatchupPeriod-1}). Each player counts once per NBA game with recorded minutes greater than zero while in that day’s active fantasy lineup. Bench, IR, zero-minute games and unplayed scheduled games do not count. Today’s appearances may still update.`];
    for(const team of rows) {
        lines.push(`${team.team_name}: season ${value(team.season)}; this week ${value(team.current)}; last week ${value(team.previous)}.`);
        if(team.season.missingDays || team.season.uncertainEntries) lines.push(`${team.team_name}: ${team.season.missingDays} daily lineups unavailable; ${team.season.uncertainEntries} entries lack usable minutes, game IDs or active-slot information. Missing data is not counted as zero games.`);
    }
    if(report.unmappedDays.length) lines.push(`${report.unmappedDays.length} scoring days could not be assigned to a matchup. Week totals may be incomplete.`);
    return lines;
}
function format(data, action = 'overview') {
    const name = data.team?.team_name;
    const labels = { overview: 'update', roster: 'roster', injuries: 'injury report', league_injuries: 'league injury report', standings: 'standings', matchup: 'matchup update', free_agents: 'available players', played_games: 'active games played comparison' };
    const lines = [`Here's ${name ? `the ${labels[action] || 'update'} for ${name}` : `your fantasy basketball ${labels[action] || 'update'}`}${data.leagueName ? ` in ${data.leagueName}` : ''}.`];
    const date = new Date(data.fetchedAt);
    if (!Number.isNaN(date.getTime())) lines.push(`Checked ESPN on ${date.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}.`);
    if (data.notice) lines.push(data.notice);
    if (data.playedGames) lines.push(...playedGamesLines(data.playedGames));
    if (data.injuryDetailsNotice) lines.push(data.injuryDetailsNotice);
    else if (data.injuryDetailsSource) lines.push(`Return estimates and injury details: ${data.injuryDetailsSource}.`);
    if (action === 'injuries' || action === 'league_injuries') lines.push('Return dates are ESPN estimates, not guaranteed return dates. An OUT flag alone does not establish rest, a one-game absence, or a long-term injury.');
    if (data.standings) {
        const own = data.standings.find(t => t.team_id === data.team?.team_id);
        if (own) lines.push(`${own.team_name} is ranked ${own.standing || 'unavailable'} out of ${data.standings.length}, with ${record(own)}.`);
        lines.push('League standings:', ...data.standings.map(t => `${t.standing ? `Number ${t.standing}` : 'Rank unavailable'}: ${t.team_name}, with ${record(t)}${!data.team ? `. Team ID ${t.team_id}` : ''}.`));
    }
    if (data.matchups) lines.push('Current matchup:', ...(data.matchups.length ? data.matchups.map(m => matchupLine(m, data)) : ['No matchup was returned for this period.']));
    if (data.roster) {
        lines.push(action === 'injuries' ? 'Injury report:' : 'Your roster:', ...(data.roster.length
            ? data.roster.map(p => displayPlayer(p, data.scoringType, false, data.fetchedAt))
            : [action === 'injuries' ? 'ESPN returned no injury flags for your roster.' : 'No roster players were returned.']));
    }
    if (data.freeAgents) lines.push('Available players:', ...(data.freeAgents.length ? data.freeAgents.map(p => displayPlayer(p, data.scoringType, true, data.fetchedAt)) : ['No available players were returned.']));
    if (data.leagueInjuries) {
        if (!data.leagueInjuries.length) lines.push('ESPN returned no injury flags across the league rosters.');
        for (const group of data.leagueInjuries) {
            lines.push(`${group.team.team_name}:`, ...group.players.map(p => displayPlayer(p, data.scoringType, true, data.fetchedAt)));
        }
    }
    return lines.join('\n\n');
}
module.exports = { format, formatSpeech, injuryTimeline, TEAMS, POSITIONS, position };
