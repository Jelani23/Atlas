import unittest
import datetime
import json
from types import SimpleNamespace as NS
from bridge import collect, enrich_injuries


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.request = dict(leagueId=1325670339, season=2027, teamId=7, action="overview")
        self.player = NS(name="Test Player", injured=True, injuryStatus="OUT", stats={"2027_total": {"avg": {"REB": 7}}})
        self.team = NS(team_id=7, team_name="Jitters", standing=2, roster=[self.player])
        self.league = NS(teams=[self.team], settings=NS(name="Test League", scoring_type="H2H_POINTS"),
                         currentMatchupPeriod=3, current_week=15,
                         box_scores=lambda: [NS(home_team=self.team, away_team=0, home_score=123, away_score=0, winner="UNDECIDED")],
                         free_agents=lambda size: [self.player])

    def collect(self, **updates):
        return collect({**self.request, **updates}, lambda **kwargs: self.league)

    def test_overview_is_bounded_and_handles_bye(self):
        data = self.collect()
        self.assertEqual(data["team"]["team_name"], "Jitters")
        self.assertEqual(data["matchups"][0]["away"]["team_name"], "BYE")
        self.assertEqual(data["roster"][0]["season_stats"], {"REB": 7})
        self.assertIn("fetchedAt", data)
        self.assertNotIn("owners", data["team"])

    def test_bad_and_missing_team(self):
        self.assertEqual(self.collect(teamId=9), {"error": "TEAM_NOT_FOUND"})
        data = self.collect(teamId=None, action="roster")
        self.assertIn("ESPN_TEAM_ID", data["notice"])

    def test_return_date_is_serializable_and_missing_is_not_invented(self):
        self.assertIsNone(self.collect()["roster"][0]["expectedReturnDate"])
        self.player.expected_return_date = datetime.date(2027, 1, 15)
        data = self.collect(action="league_injuries")
        self.assertEqual(data["leagueInjuries"][0]["players"][0]["expectedReturnDate"], "2027-01-15")
        json.dumps(data, allow_nan=False)

    def test_public_enrichment_matches_ids_and_preserves_status(self):
        self.player.playerId = 42
        feed = {"season": {"year": 2027}, "injuries": [{"injuries": [
            {"date": "2026-11-08T12:00Z", "athlete": {"displayName": "Different spelling", "links": [
                {"href": "https://www.espn.com/nba/player/_/id/42/player"}]},
             "status": "Day-To-Day", "details": {"returnDate": "2026-12-01", "side": "Left", "type": "Hamstring", "detail": "Not Specified"},
             "shortComment": "Player does not have a timetable to return."},
            {"date": "2026-11-07T12:00Z", "athlete": {"id": "42"}, "details": {"returnDate": "2026-11-09"}},
            {"athlete": {"displayName": "Test Player"}, "details": {"returnDate": "2026-11-10"}}
        ]}]}
        data = enrich_injuries(self.collect(action="injuries"), lambda: feed)
        player = data["roster"][0]
        self.assertEqual(player["expectedReturnDate"], "2026-12-01")
        self.assertEqual(player["injuryReason"], "Left Hamstring")
        self.assertEqual(player["injuryStatus"], "OUT")
        self.assertTrue(player["returnTimetableUnconfirmed"])
        self.assertNotIn("shortComment", player)

    def test_enrichment_failure_and_wrong_season_preserve_roster(self):
        def fail():
            raise TimeoutError()
        for load in (fail, lambda: {"season": {"year": 2026}, "injuries": []}):
            data = enrich_injuries(self.collect(action="injuries"), load)
            self.assertEqual(data["roster"][0]["name"], "Test Player")
            self.assertIn("could not be retrieved", data["injuryDetailsNotice"])
        data = enrich_injuries(self.collect(action="standings"), fail)
        self.assertNotIn("injuryDetailsNotice", data)

    def test_category_scores_and_roto(self):
        self.league.settings.scoring_type = "H2H_CATEGORY"
        self.league.box_scores = lambda: [NS(home_team=self.team, away_team=0, winner="UNDECIDED", home_stats={"REB": {"value": 100}}, home_wins=5)]
        home = self.collect()["matchups"][0]["home"]
        self.assertEqual(home["home_wins"], 5)
        self.assertIsNone(home["home_score"])
        self.league.settings.scoring_type = "ROTO"
        self.assertNotIn("matchups", self.collect())

    def test_injuries_and_free_agents(self):
        self.team.roster.append(NS(name="Healthy", injured=False, injuryStatus="ACTIVE", stats={}))
        self.assertEqual(len(self.collect(action="injuries")["roster"]), 1)
        self.assertEqual(len(self.collect(action="free_agents")["freeAgents"]), 1)

    def test_league_injuries_include_other_rosters_and_keep_scope(self):
        self.league.teams.append(NS(team_id=8, team_name="Rival", roster=[
            NS(name="Rival Injured", injured=False, injuryStatus="DAY_TO_DAY", stats={}),
            NS(name="Healthy Rival", injured=False, injuryStatus="ACTIVE", stats={})]))
        self.assertEqual(len(self.collect(action="injuries")["roster"]), 1)
        data = self.collect(action="league_injuries")
        self.assertEqual([g["team"]["team_id"] for g in data["leagueInjuries"]], [7, 8])
        self.assertEqual([p["name"] for p in data["leagueInjuries"][1]["players"]], ["Rival Injured"])
        self.assertIn("unrostered", data["notice"])


if __name__ == "__main__":
    unittest.main()
