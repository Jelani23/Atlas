"""Read-only ESPN basketball bridge. JSON on stdin/stdout; credentials via env only."""
import contextlib
import datetime
import io
import json
import os
import re
import sys

INJURY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"


def load_public_injuries():
    import requests
    # Public feed: never send private fantasy cookies to this request.
    response = requests.get(INJURY_URL, timeout=8)
    response.raise_for_status()
    return response.json()


def enrich_injuries(result, load=load_public_injuries):
    players = list(result.get("roster", [])) + list(result.get("freeAgents", []))
    for group in result.get("leagueInjuries", []):
        players.extend(group["players"])
    for team in result.get("teams", []):
        players.extend(team["roster"])
    players = [p for p in players if injury_flag(p)]
    if not players:
        return result
    try:
        feed = load()
        if feed.get("season", {}).get("year") != result.get("season"):
            raise ValueError("Injury feed season does not match")
        by_id = {}
        for team in feed.get("injuries", []):
            for entry in team.get("injuries", []):
                athlete = entry.get("athlete", {})
                player_id = str(athlete.get("id", ""))
                if not player_id.isdigit():
                    for link in athlete.get("links", []):
                        match = re.search(r"^https://www\.espn\.com/nba/player/(?:[^/]+/)?_/id/(\d+)(?:/|$)", link.get("href", ""))
                        if match:
                            player_id = match[1]
                            break
                if not player_id.isdigit():
                    continue
                previous = by_id.get(player_id)
                if not previous or entry.get("date", "") > previous.get("date", ""):
                    by_id[player_id] = entry
        for player in players:
            entry = by_id.get(str(player.get("playerId")))
            if not entry:
                continue
            details = entry.get("details", {})
            value = details.get("returnDate")
            try:
                player["expectedReturnDate"] = datetime.date.fromisoformat(value).isoformat()
            except (TypeError, ValueError):
                pass
            reason = [details.get(k) for k in ("side", "type", "detail")]
            player["injuryReason"] = " ".join(v for v in reason if isinstance(v, str) and v.lower() not in ("not specified", "unknown", ""))[:160] or None
            report = entry.get("shortComment", "") + " " + entry.get("longComment", "")
            player["returnTimetableUnconfirmed"] = bool(re.search(r"no (?:clear |definitive |firm )?(?:timetable|timeline)|does not have a (?:timetable|timeline)|(?:timetable|timeline).{0,35}(?:uncertain|unclear)|indefinitely|season.ending|out for the season", report, re.I))
            player["injuryUpdatedAt"] = entry.get("date")
            player["injurySource"] = INJURY_URL
        result["injuryDetailsSource"] = "ESPN public NBA injury feed"
    except Exception:
        result["injuryDetailsNotice"] = "Additional ESPN injury details could not be retrieved for this season; fantasy status flags are still shown."
    return result


def fields(obj, names):
    return {name: getattr(obj, name, None) for name in names.split()}


def team_row(team):
    if isinstance(team, int) or team is None:
        return {"team_id": team, "team_name": "BYE" if not team else "Unknown"}
    return fields(team, "team_id team_name standing wins losses ties points_for points_against")


def player_row(player, year):
    row = fields(player, "playerId name position proTeam lineupSlot eligibleSlots injuryStatus injured total_points avg_points")
    expected = getattr(player, "expected_return_date", None)
    # The library exposes a date, not a confirmed clearance or an injury reason.
    row["expectedReturnDate"] = expected.isoformat() if isinstance(expected, datetime.date) and not isinstance(expected, datetime.datetime) else None
    row["season_stats"] = getattr(player, "stats", {}).get(f"{year}_total", {}).get("avg")
    return row


def injury_flag(player):
    return bool(player["injured"] or player["injuryStatus"] not in (None, "ACTIVE", "NORMAL", "HEALTHY"))


def collect(request, league_factory):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    snapshot_mode = request["action"] == "snapshot"
    league = league_factory(
        league_id=request["leagueId"], year=request["season"],
        espn_s2=os.environ.get("ESPN_S2") or None,
        swid=os.environ.get("ESPN_SWID") or None, debug=False,
        **({"fetch_league": False} if snapshot_mode else {}),
    )
    if snapshot_mode:
        original_get = league.espn_request.get_league
        def capture():
            data = original_get()
            league._atlas_raw = data
            return data
        league.espn_request.get_league = capture
        league.fetch_league()
    action = request["action"]
    selected = next((t for t in league.teams if t.team_id == request.get("teamId")), None)
    if request.get("teamId") and selected is None:
        return {"error": "TEAM_NOT_FOUND"}
    result = {
        "source": "ESPN fantasy basketball via espn-api",
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "leagueId": request["leagueId"], "season": request["season"],
        "leagueName": getattr(league.settings, "name", None),
        "scoringType": getattr(league.settings, "scoring_type", None),
        "matchupPeriod": league.currentMatchupPeriod,
        "scoringPeriod": league.current_week,
        "team": team_row(selected) if selected else None,
        "collectionStartedAt": started,
    }
    if action == "snapshot":
        from snapshot import collect_snapshot
        return collect_snapshot(league, result, player_row)
    if action in ("overview", "standings"):
        # Preserve ESPN's seed; final_standing can be None in ongoing seasons.
        result["standings"] = [team_row(t) for t in sorted(league.teams, key=lambda t: getattr(t, "standing", 0) or 999)]
    if action in ("overview", "roster", "injuries"):
        if selected is None:
            result["notice"] = "Set ESPN_TEAM_ID to select your team; standings list the IDs."
        else:
            roster = [player_row(p, request["season"]) for p in selected.roster]
            result["roster"] = [p for p in roster if injury_flag(p)] if action == "injuries" else roster
    if action == "league_injuries":
        result["leagueInjuries"] = []
        for team in league.teams:
            players = [player_row(p, request["season"]) for p in team.roster]
            injured = [p for p in players if injury_flag(p)]
            if injured:
                result["leagueInjuries"].append({"team": team_row(team), "players": injured})
        result["notice"] = "Injury flags across all fantasy team rosters in this league. This does not include unrostered players or every NBA injury."
    if action in ("overview", "matchup"):
        if result["scoringType"] not in ("H2H_POINTS", "H2H_CATEGORY", "H2H_MOST_CATEGORIES"):
            result["notice"] = "Matchups are only supported for head-to-head leagues."
        else:
            result["matchups"] = []
            for box in league.box_scores():
                home, away = team_row(box.home_team), team_row(box.away_team)
                if selected and selected.team_id not in (home["team_id"], away["team_id"]):
                    continue
                row = {"home": home, "away": away, "winner": box.winner}
                for side in ("home", "away"):
                    row[side].update(fields(box, " ".join(f"{side}_{key}" for key in ("score", "wins", "losses", "ties", "stats"))))
                result["matchups"].append(row)
    if action == "free_agents":
        result["freeAgents"] = [player_row(p, request["season"]) for p in league.free_agents(size=20)]
        result["notice"] = "First 20 available players in ESPN library order, not personalized pickup recommendations."
    if action in ("overview", "played_games"):
        from played_games import collect_played_games
        result["playedGames"] = collect_played_games(league)
        result["fetchedAt"] = result["playedGames"]["fetchedAt"]
    return result


def main():
    try:
        from espn_api.basketball import League
        from espn_api.requests.espn_requests import ESPNAccessDenied, ESPNInvalidLeague
    except ImportError:
        print(json.dumps({"error": "DEPENDENCY_MISSING"}))
        return
    try:
        request = json.load(sys.stdin)
        # Upstream diagnostics must never leak cookies or raw responses to chat.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = enrich_injuries(collect(request, League))
            if result.get("snapshotVersion"):
                result["fetchedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        print(json.dumps(result, allow_nan=False))
    except ESPNAccessDenied:
        print(json.dumps({"error": "AUTH_REQUIRED"}))
    except ESPNInvalidLeague:
        print(json.dumps({"error": "INVALID_LEAGUE"}))
    except Exception:
        print(json.dumps({"error": "ESPN_FETCH_FAILED"}))


if __name__ == "__main__":
    main()
