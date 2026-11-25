const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configuration, query, format, runBridge } = require('../src/integrations/espnFantasy');
const { parseRequest } = require('../src/tools/fantasy');
const env = { ESPN_LEAGUE_ID: '1325670339', ESPN_SEASON: '2027', ESPN_TEAM_ID: '7' };

test('configuration requires an explicit valid season and team', () => {
    assert.equal(configuration(env).teamId, 7);
    for (const bad of [{}, { ...env, ESPN_SEASON: '2026-27' }, { ...env, ESPN_TEAM_ID: '-1' }]) {
        assert.throws(() => configuration(bad));
    }
    assert.equal(configuration({ ...env, ESPN_TEAM_ID: '' }).teamId, null);
});
test('only read actions reach bridge, without credentials in arguments', async () => {
    let calls = 0;
    const bridge = async config => {
        calls++;
        assert.equal(config.ESPN_S2, undefined);
        return { error: 'TEAM_NOT_FOUND' };
    };
    assert.match(await query('trade', { env, bridge }), /only reads/);
    assert.equal(calls, 0);
    assert.match(await query('roster', { env: { ...env, ESPN_S2: 'secret' }, bridge }), /does not match/);
    assert.equal(calls, 1);
    assert.match(await query('overview', { env: {}, bridge }), /Set ESPN_LEAGUE_ID/);
    assert.equal(calls, 1);
});
test('only explicit command syntax is matched without semantic interpretation', () => {
    assert.equal(parseRequest('Fantasy NBA: free agents'), 'free_agents');
    assert.equal(parseRequest('Fantasy NBA: league injuries'), 'league_injuries');
    assert.equal(parseRequest('Show my fantasy basketball roster'), null);
    for (const input of ['Explain how ESPN fantasy works', "Don't check my fantasy basketball roster", 'Show my fantasy basketball roster and standings', 'Trade my fantasy NBA players', 'What is the NBA score?']) {
        assert.equal(parseRequest(input), null, input);
    }
});
test('category matchups never invent fantasy point scores', () => {
    const text = format({ season: 2027, fetchedAt: '2026-11-08T20:00:00Z', scoringType: 'H2H_CATEGORY',
        matchups: [{ home: { team_name: 'Jitters', home_wins: 5, home_losses: 3, home_ties: 1, home_stats: { REB: { value: 100 } } },
            away: { team_name: 'Rival', away_wins: 3, away_losses: 5, away_ties: 1, away_stats: {} }, winner: 'UNDECIDED' }] });
    assert.match(text, /Checked ESPN on November/);
    assert.match(text, /5 category wins, 3 category losses, and 1 tie/);
    assert.match(text, /rebounds/);
    assert.doesNotMatch(text, /undefined|fantasy points/);
});
test('discussion and other sports are not explicit commands', () => {
    for (const input of ['What does the ESPN fantasy module do?', 'Can you implement ESPN fantasy NBA rankings?',
        'Show the ESPN fantasy NBA code', 'What is the NBA ranking?', 'Do not show my ESPN NBA standings',
        'Show my fantasy league football standings', 'Show my fantasy baseball standings']) {
        assert.equal(parseRequest(input), null, input);
    }
});
test('roster preserves display abbreviations and expands only speech', () => {
    const { TEAMS, POSITIONS, position, formatSpeech } = require('../src/integrations/espnFantasyPresenter');
    assert.equal(Object.keys(TEAMS).length, 33); // 30 teams, two aliases, and free agent.
    assert.equal(position('SG/SF'), 'shooting guard or small forward');
    for (const [proTeam, teamName] of Object.entries(TEAMS)) {
        for (const [slot, fullPosition] of Object.entries(POSITIONS)) {
            const result = format({ team: { team_name: 'Jitters' }, scoringType: 'H2H_POINTS',
                roster: [{ name: 'Sample Player', proTeam, position: slot, lineupSlot: slot, injuryStatus: 'DAY_TO_DAY', avg_points: 29 }] }, 'roster');
            assert(result.includes(`${proTeam}, ${slot}`));
            assert.match(result, /DAY_TO_DAY/);
            const speech = require('../src/voice/tts/speechPreprocessor').prepareForTTS(formatSpeech(result));
            assert(speech.includes(fullPosition));
            assert(speech.includes(teamName));
            assert.match(speech, /day-to-day/);
            assert.match(speech, /29 fantasy points per game/);
            assert.doesNotMatch(speech, /H2H_POINTS|DAY_TO_DAY|season avg|undefined/);
        }
    }
    const result = format({ scoringType: 'H2H_POINTS', roster: [
        { name: 'Bench Player', position: 'SF', proTeam: 'BOS', lineupSlot: 'BE', injuryStatus: 'ACTIVE' },
        { name: 'Reserve Player', position: 'PG', proTeam: 'PHL', lineupSlot: 'IR', injuryStatus: 'OUT' }
    ] }, 'roster');
    assert.match(result, /BOS, SF; slot: BE/);
    assert.match(result, /PHL, PG; slot: IR/);
    assert.match(formatSpeech(result), /On your bench/);
    assert.match(formatSpeech(result), /In your injured reserve slot. Listed as out/);
    assert.equal(formatSpeech('BOS is my team name. C and PF are variable names.'), 'BOS is my team name. C and PF are variable names.');
    const { formatImmediateToolReply, formatImmediateToolSpeech } = require('../src/response/toolResultPresenter');
    const route = { toolName: 'multi_tool', toolResults: [
        { toolName: 'espnFantasy', result, status: 'complete' },
        { toolName: 'readCode', result: 'const PF = "BOS";', status: 'complete' }
    ] };
    assert.match(formatImmediateToolReply(route), /BOS, SF/);
    const spoken = formatImmediateToolSpeech(route);
    assert.match(spoken, /small forward for Boston Celtics/);
    assert.match(spoken, /const PF = "BOS"/);
});
test('missing Python produces a safe actionable error', async () => {
    await assert.rejects(runBridge({ ...configuration(env), python: 'atlas-missing-python-executable' }, 'overview'), /Python was not found/);
});
test('played game counts appear in overview with explicit coverage and exact command support',()=>{
    const part={count:12,days:7,complete:true,missingDays:0,uncertainEntries:0};
    const data={team:{team_name:'Jitters'},playedGames:{currentMatchupPeriod:4,unmappedDays:[],teams:[
        {team_name:'Jitters',season:part,current:{...part,count:0},previous:part},
        {team_name:'Other',season:{...part,count:5,missingDays:1,complete:false},current:part,previous:part}
    ]}};
    const output=format(data,'overview');
    assert.match(output,/Jitters: season 12; this week 0; last week 12/);
    assert.match(output,/5 confirmed \(partial\)/);
    assert.match(output,/Missing data is not counted as zero games/);
    const intent=require('../src/integrations/espnFantasyIntent');
    assert.equal(intent.explicitAction('Fantasy NBA: games played'),'played_games');
    assert.equal(intent.explicitAction('Fantasy NBA: stats overview'),'played_games');
});
test('tool is discoverable and has an argument contract and policy', () => {
    process.env.SUPABASE_URL ||= 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
    assert(require('../src/tools/toolRegistry').getSchemas().some(s => s.name === 'espnFantasy'));
    assert(require('../src/tools/toolArguments').validateToolArguments('espnFantasy', ['roster']));
    assert.equal(require('../src/permissions/permissionPolicy').POLICY.espnFantasy.default, 'allow');
});
test('Alice planner executes fantasy requests through the registered tool', async () => {
    process.env.SUPABASE_URL ||= 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
    const tool = require('../src/tools').espnFantasy;
    const original = tool.execute;
    const calls = [];
    try {
        tool.execute = async (...args) => { calls.push(args); return 'Jitters fixture'; };
        const planner = require('../src/planner/planner');
        const result = await planner.route({}, 'Fantasy NBA: roster');
        assert.equal(result.toolName, 'espnFantasy');
        assert.equal(result.toolResult, 'Jitters fixture');
        assert.equal(result.shortCircuit, true);
        const discussion = await planner.route({}, 'Explain how ESPN fantasy works', [], null, null, { fantasyRequest: null });
        assert.equal(discussion.needsTool, false);
        await planner.route({}, 'Fantasy NBA: lineup next');
        const parameters={window:'next',give:['Harden'],receive:['Tatum']};
        await planner.route({}, 'Compare this exchange', [], null, null, {fantasyRequest:{kind:'read',actions:['evaluate_trade'],parameters}});
        assert.deepEqual(calls, [['roster'],['optimize_lineup',JSON.stringify({window:'next'})],['evaluate_trade',JSON.stringify(parameters)]]);
    } finally { tool.execute = original; }
});
