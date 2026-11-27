const assert = require('node:assert/strict');
const builder = require('../src/response/responseBuilder');
const { summarize, render } = require('../src/response/fantasyResponse');
const forecast = `ESPN analysis for Jitters in Test League.

Source snapshot checked Nov 26, 2026, 1:36 PM CST. Collection took 3.5 seconds.

These are deterministic scenarios, not win probabilities. Injury availability is uncertain.

Jitters: 442 actual points; 573 to 573 projected fantasy points from future games.

Opponent: 363 actual points; 592 to 614.4 projected fantasy points from future games.

Final-score scenarios: 1,015 to 1,015 for you; 955 to 977.4 for your opponent.`;
(async () => {
    const noModel = { complete: () => assert.fail('Known deterministic assessment needs no extra model call') };
    const original = builder.normalizeTool({ toolName: 'espnFantasy', toolResult: forecast });
    const result = await builder.compose({ result: original, userInput: 'Who would you lean towards to win?' }, noModel);
    assert.match(result.display, /lean toward Jitters/);
    assert.match(result.display, /1,015 points, against 955–977.4/);
    assert.match(result.display, /not a win probability/);
    assert.match(result.display, /Nov 26, 2026/);
    assert.doesNotMatch(result.display, /Collection took|573 to 573/);
    assert.equal(original.data.report, forecast);
    const overlap = render(summarize(forecast.replace('1,015 to 1,015', '950 to 1,015'), 'Who wins?'));
    assert.match(overlap, /scenarios overlap/);
    const rival = render(summarize(forecast.replace('1,015 to 1,015', '850 to 900'), 'Who wins?'));
    assert.match(rival, /lean toward your opponent/);
    const missing = render(summarize(forecast + '\n\nMissing rates (counted as zero): Player.', 'Who wins?'));
    assert.match(missing, /confident pick difficult/); assert.match(missing, /Missing rates/);
    assert.equal(summarize(forecast, 'Give the full detailed forecast'), null);
    assert.equal(summarize(forecast + '\n\n' + forecast, 'Who wins?'), null, 'Do not drop a second requested report');
    const overview = `Here's the update for Jitters in Test League.\n\nChecked ESPN today.\n\nJitters is ranked 1 out of 10, with 5 wins, 0 losses.\n\nCurrent matchup:\n\nJitters has 442 points against Opponent, with 363 points. Ahead by 79 points. No winner has been declared yet.\n\nYour roster:\n\nHealthy Player — BOS, PF; slot: PF; status: ACTIVE.\n\nInjured Player — BOS, PG; slot: IR; status: OUT. Return date unconfirmed.`;
    const brief = render(summarize(overview, 'What current things can you tell me about my league?'));
    assert.match(brief, /ranked 1/); assert.match(brief, /Ahead by 79/); assert.match(brief, /Return date unconfirmed/);
    assert.doesNotMatch(brief, /Healthy Player/);
    assert.equal(summarize(overview, 'Show my entire roster'), null);
    const error = builder.normalizeTool({ toolName: 'espnFantasy', toolResult: 'ESPN denied access. Add or refresh ESPN_S2 and ESPN_SWID in backend/.env.' });
    const failed = await builder.compose({ result: error }, noModel);
    assert.equal(failed.status, 'failure'); assert.match(failed.display, /couldn’t retrieve/); assert.doesNotMatch(failed.display, /ESPN_S2/);
    assert.match((await builder.compose({ result: error, userInput: 'Show the full error message' }, noModel)).display, /ESPN_S2/);
    const { deviceAnswer } = require('../src/response/directResponse');
    assert.match(deviceAnswer('Which device am I using?', { client: { displayName: 'MacBook', os: 'macos', clientType: 'electron' } }), /MacBook, registered as macOS/);
    assert.match(deviceAnswer('Which device am I using?', {}), /don’t have a registered client/);
    assert.equal(deviceAnswer('What are your favorite songs?', {}), null);
    const { personaAnswer } = require('../src/response/directResponse');
    const profile = require('../src/core/atlasState').atlasState;
    assert.match(personaAnswer('Do you have any favorite songs from Ado or any favorite idols from Hololive?', profile), /haven’t settled/);
    assert.equal(personaAnswer('What are my favorite songs from Ado?', profile), null);
    assert.equal(personaAnswer('Do you have favorite songs from Ado? Search for new releases.', profile), null);
    assert.equal(require('../src/response/output').cleanGenerated('Final response: A game is visible.'), 'A game is visible.');
    const { interpret } = require('../src/intent/inputUnderstanding');
    for (const text of ['Alright I put that in', 'Look!', 'check the game on the other monitor', "So what's the final verdict?"])
        assert.equal((await interpret(text, { activeTask: 'wordle' }, noModel)).disposition, 'wordle', text);
    assert.equal((await interpret('Look at the other monitor', { activeTask: 'wordle' }, noModel)).disposition, 'screen');
    const math = require('../src/intent/explicitToolRequest').parseExplicitToolRequest('Ok well lets test out some other things. What is 169 divided by 13?');
    assert.deepEqual(math, { toolName: 'calculate', args: ['169 / 13'] });
    console.log('Response usability: concise forecasts/overview, uncertainties, errors, devices, markers and active-game follow-ups passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
