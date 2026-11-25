import unittest
from types import SimpleNamespace as NS
from played_games import count_day, collect_played_games


def entry(player, slot, minutes=20, day=1, **overrides):
    stat = dict(seasonId=2027, scoringPeriodId=day, statSourceId=0, statSplitTypeId=5,
                externalId='game1', stats={'40': minutes}, appliedTotal=0)
    stat.update(overrides)
    return {'playerId': player, 'lineupSlotId': slot, 'playerPoolEntry': {'player': {'stats': [stat]}}}


def data(entries, team=7, period=1):
    return {'schedule': [{'matchupPeriodId': period, 'home': {'teamId': team,
        'rosterForCurrentScoringPeriod': {'entries': entries}}}]}


class PlayedGamesTests(unittest.TestCase):
    def test_only_actual_minutes_in_active_daily_slots(self):
        entries = [entry(1,0),entry(2,12),entry(3,13),entry(4,4,0),entry(5,11,0.1),
                   entry(6,1,stats={}),entry(7,0,statSourceId=1),entry(8,0,day=2),
                   entry(9,0,seasonId=2026),entry(10,0,statSplitTypeId=0)]
        result=count_day(data(entries),1,1,2027,[7])[7]
        self.assertEqual(result,dict(count=2,available=True,uncertain=0))

    def test_deduplicate_and_require_raw_minutes_not_points(self):
        a=entry(1,0,0.5)
        a['playerPoolEntry']['player']['stats']*=2
        b=entry(2,0,stats={'0':20},appliedStats={'40':50})
        result=count_day(data([a,a,b,entry(3,0,externalId=None)]),1,1,2027,[7])[7]
        self.assertEqual(result['count'],1)
        self.assertEqual(result['uncertain'],2)

    def test_no_fallback_to_aggregate_roster_and_missing_teams(self):
        raw=data([entry(1,0)])
        side=raw['schedule'][0]['home']
        side['rosterForMatchupPeriod']=side.pop('rosterForCurrentScoringPeriod')
        result=count_day(raw,1,1,2027,[7,8])
        self.assertFalse(result[7]['available'])
        self.assertFalse(result[8]['available'])

    def test_daily_bench_changes_transfers_and_partial_coverage(self):
        league=NS(currentMatchupPeriod=2,current_week=3,firstScoringPeriod=1,year=2027,
                  matchup_ids={1:['1','2'],2:['3']},teams=[NS(team_id=7,team_name='Jitters'),NS(team_id=8,team_name='Other')])
        def load(day,period):
            if day==3: raise TimeoutError('must never leak')
            # Same player starts for team 7 on day 1 and team 8 on day 2.
            a=data([entry(1,0,day=1)] if day==1 else [],7,period)
            a['schedule']+=data([] if day==1 else [entry(1,0,day=2),entry(2,12,day=2)],8,period)['schedule']
            return a
        result=collect_played_games(league,load)
        own=result['teams'][0]
        self.assertEqual(own['season']['count'],1)
        self.assertEqual(own['previous']['count'],1)
        self.assertTrue(own['previous']['complete'])
        self.assertFalse(own['season']['complete'])
        self.assertEqual(own['current']['missingDays'],1)
        self.assertEqual(result['teams'][1]['season']['count'],1)

if __name__=='__main__': unittest.main()
