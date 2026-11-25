const { test } = require('node:test');
const assert = require('node:assert/strict');
const { injuryTimeline, format, formatSpeech } = require('../src/integrations/espnFantasyPresenter');
// Local noon avoids making the fixture depend on UTC/local midnight boundaries.
const fetchedAt = new Date(2026, 10, 8, 12).toISOString();
const player = { name: 'Example Player', proTeam: 'BOS', position: 'PF', injuryStatus: 'OUT' };
test('return estimates retain uncertainty and calculate calendar days', () => {
    assert.match(injuryTimeline({ ...player, expectedReturnDate: '2026-11-09' }, fetchedAt), /November 9, 2026, in 1 day/);
    assert.match(injuryTimeline({ ...player, expectedReturnDate: '2026-12-06' }, fetchedAt), /in 28 days/);
    assert.match(injuryTimeline({ ...player, expectedReturnDate: '2026-11-08' }, fetchedAt), /today; this is not confirmed/);
    assert.match(injuryTimeline({ ...player, expectedReturnDate: '2026-11-07' }, fetchedAt), /has passed.*updated return timeline is unavailable/);
    const uncertain = injuryTimeline({ ...player, expectedReturnDate: '2026-12-06', returnTimetableUnconfirmed: true }, fetchedAt);
    assert.match(uncertain, /timetable unconfirmed.*tentative/);
    assert.doesNotMatch(uncertain, /in 28 days/);
});
test('missing or malformed dates do not imply short or long absences', () => {
    for (const expectedReturnDate of [null, '', 'unknown', '2026-02-30', '2026-11-09T00:00:00Z']) {
        assert.match(injuryTimeline({ ...player, expectedReturnDate }, fetchedAt), /not provided/);
    }
    assert.equal(injuryTimeline({ ...player, injuryStatus: 'ACTIVE', expectedReturnDate: '2026-11-09' }, fetchedAt), '');
    assert.match(injuryTimeline({ ...player, expectedReturnDate: '2026-11-09' }, 'bad'), /November 9, 2026/);
});
test('league and roster views carry dates through to speech without expanding display abbreviations', () => {
    const dated = { ...player, expectedReturnDate: '2026-12-06', injuryReason: 'Rest', injuryUpdatedAt: fetchedAt };
    for (const action of ['injuries', 'league_injuries']) {
        const data = { fetchedAt, scoringType: 'H2H_POINTS', ...(action === 'injuries' ? { roster: [dated] }
            : { leagueInjuries: [{ team: { team_name: 'Rival' }, players: [dated] }] }) };
        const text = format(data, action);
        assert.match(text, /BOS, PF/);
        assert.match(text, /in 28 days/);
        const speech = formatSpeech(text);
        assert.match(speech, /power forward for Boston Celtics/);
        assert.match(speech, /December 6, 2026, in 28 days/);
        assert.match(speech, /not confirmed clearance/);
        assert.match(speech, /ESPN lists: Rest/);
        assert.match(speech, /Injury report updated November 8, 2026/);
    }
});
