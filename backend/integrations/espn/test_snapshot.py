import unittest
from types import SimpleNamespace as NS
from snapshot import collect_snapshot
from bridge import player_row


class SnapshotTests(unittest.TestCase):
    def test_normalization_keeps_rules_locks_projections_and_ownership_boundary(self):
        p = NS(playerId=42, name="Fixture", proTeam="BOS", stats={"2027_projected": {"applied_avg": 40}, "2027_total": {"applied_avg": 35}})
        owned_entry = {"playerId": 42, "playerPoolEntry": {"lineupLocked": True, "rosterLocked": True, "status": "ONTEAM", "player": {"droppable": False}}}
        raw = {"teams": [{"id": 7, "roster": {"entries": [owned_entry]}, "owners": ["secret-owner"]}],
               "settings": {"rosterSettings": {"lineupLocktimeType": "FIRSTGAME_WEEKLY"}},
               "status": {"firstScoringPeriod": 1}, "schedule": [{"matchupPeriodId": 3, "home": {"pointsByScoringPeriod": {"14": 1, "20": 2}}}]}
        league = NS(_atlas_raw=raw, year=2027, currentMatchupPeriod=3,
                    teams=[NS(team_id=7, team_name="Jitters", standing=2, wins=2, losses=0, roster=[p])],
                    free_agents=lambda size: [p, NS(playerId=99, name="Available", proTeam="BOS", stats={})],
                    pro_schedule={2: {"14": [{"id": 1, "date": 1793660400000, "homeProTeamId": 2, "awayProTeamId": 3, "statsOfficial": False}]}},
                    box_scores=lambda: [NS(home_team=NS(team_id=7), away_team=NS(team_id=8), home_score=50, away_score=40, winner="UNDECIDED")])
        result = collect_snapshot(league, {"scoringType": "H2H_POINTS", "fetchedAt": "start", "collectionStartedAt": "start"}, player_row)
        player = result["teams"][0]["roster"][0]
        self.assertEqual(player["projectedAverage"], 40)
        self.assertTrue(player["lineupLocked"])
        self.assertFalse(player["droppable"])
        self.assertEqual(player["proTeamId"], 2)
        self.assertEqual([p["playerId"] for p in result["freeAgents"]], [99])
        self.assertNotIn("owners", result["teams"][0])
        self.assertEqual(result["currentScoringPeriods"], [14, 20])
        self.assertEqual(result["matchups"][0]["homeScore"], 50)
        self.assertEqual(result["games"][0]["scoringPeriod"], 14)


if __name__ == "__main__":
    unittest.main()
