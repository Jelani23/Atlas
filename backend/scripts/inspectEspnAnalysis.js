require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { configuration } = require('../src/integrations/espnFantasy');
const script = `import os,json
from espn_api.basketball import League
l=League(int(os.environ['ESPN_LEAGUE_ID']),int(os.environ['ESPN_SEASON']),espn_s2=os.environ.get('ESPN_S2'),swid=os.environ.get('ESPN_SWID'))
d=l.espn_request.get_league()
p=l.espn_request.get_pro_schedule()
print(json.dumps({'settings':d['settings'],'status':d['status'],'scoringPeriodId':d['scoringPeriodId'],'scheduleSample':[m for m in d['schedule'] if m['matchupPeriodId']==l.currentMatchupPeriod][:1],'rosterEntry':d['teams'][0]['roster']['entries'][0],'proKeys':list(p.keys()),'settingsKeys':p.get('settings'), 'proScheduleSample':{k:v for k,v in p.items() if k!='settings'}},default=str))
`;
const output = require('node:child_process').execFileSync(configuration().python, ['-c', script], {
    env: process.env, timeout: 45000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8'
});
const data = JSON.parse(output);
const settings = data.settings;
console.log(JSON.stringify({ settings: { rosterSettings: settings.rosterSettings, acquisitionSettings: settings.acquisitionSettings },
    status: data.status, scoringPeriodId: data.scoringPeriodId,
    scheduleSample: data.scheduleSample.map(m => ({ id:m.id, matchupPeriodId:m.matchupPeriodId, home:{teamId:m.home.teamId,totalPoints:m.home.totalPoints,totalPointsLive:m.home.totalPointsLive,periods:m.home.pointsByScoringPeriod}, away:{teamId:m.away.teamId,totalPoints:m.away.totalPoints,totalPointsLive:m.away.totalPointsLive} })),
    rosterFields:Object.keys(data.rosterEntry), poolFields:Object.keys(data.rosterEntry.playerPoolEntry),
    projections:data.rosterEntry.playerPoolEntry.player.stats.map(s=>({id:s.id,seasonId:s.seasonId,scoringPeriodId:s.scoringPeriodId,statSourceId:s.statSourceId,statSplitTypeId:s.statSplitTypeId,appliedAverage:s.appliedAverage,appliedTotal:s.appliedTotal,games:s.stats?.['42']})),
    proKeys:data.proKeys, settingsKeys:Object.keys(data.settingsKeys || {}),
    calendar:Object.fromEntries(Object.entries(data.settingsKeys || {}).filter(([k])=>/period|season|date/i.test(k)).map(([k,v])=>[k,Array.isArray(v)?v.slice(0,3):typeof v==='object'?Object.entries(v).slice(0,3):v])),
    proScheduleOtherKeys:Object.keys(data.proScheduleSample), proScheduleOther: Object.fromEntries(Object.entries(data.proScheduleSample).filter(([k])=>k!=='proTeams')) }, null, 2));
