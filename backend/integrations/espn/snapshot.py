"""Normalized read-only analysis snapshot; no owners, cookies or raw responses."""
import datetime
from espn_api.basketball.constant import PRO_TEAM_MAP


def collect_snapshot(league, base, player_row):
    raw = league._atlas_raw
    entries = {t["id"]: t.get("roster", {}).get("entries", []) for t in raw["teams"]}
    pro_ids = {name: key for key, name in PRO_TEAM_MAP.items()}
    def normalize(player, entry=None):
        row = player_row(player, league.year)
        row.pop("season_stats", None)
        pool = (entry or {}).get("playerPoolEntry", {})
        row.update({"proTeamId": pro_ids.get(player.proTeam),
                    "defaultPositionId": pool.get("player", {}).get("defaultPositionId", {"PG": 1, "SG": 2, "SF": 3, "PF": 4, "C": 5}.get(getattr(player, "position", None))),
                    "rosterStatus": (entry or {}).get("status"),
                    "lineupLocked": pool.get("lineupLocked"),
                    "rosterLocked": pool.get("rosterLocked"),
                    "droppable": pool.get("player", {}).get("droppable"),
                    "poolStatus": pool.get("status"),
                    "projectedAverage": getattr(player, "stats", {}).get(f"{league.year}_projected", {}).get("applied_avg"),
                    "observedAverage": getattr(player, "stats", {}).get(f"{league.year}_total", {}).get("applied_avg")})
        return row
    base["snapshotVersion"] = 1
    base["settings"] = {key: raw["settings"].get(key, {}) for key in ("rosterSettings", "scheduleSettings", "acquisitionSettings", "tradeSettings")}
    # Trade settings can include dates and rules, never account credentials.
    base["teams"] = []
    for team in league.teams:
        raw_entries = {e["playerId"]: e for e in entries.get(team.team_id, [])}
        base["teams"].append({"team_id": team.team_id, "team_name": team.team_name,
                              "standing": team.standing, "wins": team.wins, "losses": team.losses,
                              "roster": [normalize(p, raw_entries.get(p.playerId)) for p in team.roster]})
    base["freeAgents"] = [normalize(p) for p in league.free_agents(size=50)]
    # Do not accidentally recommend an owned player even if upstream views race.
    owned = {p["playerId"] for t in base["teams"] for p in t["roster"]}
    base["freeAgents"] = [p for p in base["freeAgents"] if p["playerId"] not in owned]
    base["freeAgentLimit"] = 50
    games = {}
    for schedule in league.pro_schedule.values():
        for period, rows in schedule.items():
            for game in rows:
                games[str(game["id"])] = {"id": game["id"], "scoringPeriod": int(period),
                    "startAt": game.get("date"), "home": game.get("homeProTeamId"), "away": game.get("awayProTeamId"),
                    "completed": game.get("statsOfficial") is True, "startTimeTBD": game.get("startTimeTBD", False),
                    "validForLocking": game.get("validForLocking")}
    base["games"] = sorted(games.values(), key=lambda g: g["startAt"] or 0)
    base["firstScoringPeriod"] = raw["status"].get("firstScoringPeriod")
    base["matchups"] = []
    # Box scores supply live totals; full-game remaining estimates must never
    # be added for games that have already started.
    boxes = league.box_scores() if base["scoringType"] == "H2H_POINTS" else []
    for box in boxes:
        base["matchups"].append({"homeId": getattr(box.home_team, "team_id", box.home_team),
                                  "awayId": getattr(box.away_team, "team_id", box.away_team),
                                  "homeScore": getattr(box, "home_score", None), "awayScore": getattr(box, "away_score", None),
                                  "winner": box.winner})
    base["currentScoringPeriods"] = sorted({int(period) for m in raw["schedule"]
        if m["matchupPeriodId"] == league.currentMatchupPeriod
        for side in ("home", "away") for period in m.get(side, {}).get("pointsByScoringPeriod", {})})
    base["fetchedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return base
