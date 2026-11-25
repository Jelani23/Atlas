"""Count actual NBA appearances in that day's fantasy starting lineup."""
import datetime
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor


def count_day(data, day, matchup, year, team_ids):
    totals = {team: {"count": 0, "available": False, "uncertain": 0} for team in team_ids}
    seen = set()
    for match in data.get("schedule", []):
        if match.get("matchupPeriodId") != matchup:
            continue
        for side_name in ("home", "away"):
            side = match.get(side_name, {})
            team = side.get("teamId")
            if team not in totals:
                continue
            # Never fall back to the aggregate matchup roster or current roster.
            entries = side.get("rosterForCurrentScoringPeriod", {}).get("entries")
            if not isinstance(entries, list):
                continue
            totals[team]["available"] = True
            for entry in entries:
                slot = entry.get("lineupSlotId")
                if slot in (12, 13):  # bench and injured reserve
                    continue
                if not isinstance(slot, int) or not 0 <= slot <= 11:
                    totals[team]["uncertain"] += 1
                    continue
                player = entry.get("playerPoolEntry", {}).get("player", {})
                player_id = entry.get("playerId")
                for stat in player.get("stats", []):
                    if (stat.get("statSourceId") != 0 or stat.get("statSplitTypeId") != 5
                            or stat.get("scoringPeriodId") != day or stat.get("seasonId") != year):
                        continue
                    # appliedStats are fantasy scoring weights, not raw minutes.
                    raw_stats = stat.get("stats")
                    # ESPN emits empty stat records for non-appearances; they
                    # are not evidence of any minutes played (nor of a reason).
                    if raw_stats == {}:
                        continue
                    minutes = (raw_stats or {}).get("40")
                    if not isinstance(minutes, (int, float)) or isinstance(minutes, bool) or not math.isfinite(minutes) or minutes < 0:
                        totals[team]["uncertain"] += 1
                        continue
                    if minutes == 0:
                        continue
                    game = stat.get("externalId")
                    if not game or player_id is None:
                        totals[team]["uncertain"] += 1
                        continue
                    key = (team, player_id, str(game))
                    if key not in seen:
                        seen.add(key)
                        totals[team]["count"] += 1
    return totals


def collect_played_games(league, load=None):
    import requests
    current = league.currentMatchupPeriod
    last_day = int(league.current_week)
    first_day = int(getattr(league, "firstScoringPeriod", 1))
    periods = {int(day): int(period) for period, days in getattr(league, "matchup_ids", {}).items() for day in days}
    teams = {t.team_id: t.team_name for t in league.teams}
    deadline = time.monotonic() + 65
    def fetch(day):
        period = periods.get(day)
        if period is None or time.monotonic() > deadline:
            return day, None
        try:
            if load:
                data = load(day, period)
            else:
                api = league.espn_request
                response = requests.get(api.LEAGUE_ENDPOINT, cookies=api.cookies,
                    params={"view": ["mMatchupScore", "mScoreboard"], "scoringPeriodId": day},
                    headers={"x-fantasy-filter": json.dumps({"schedule": {"filterMatchupPeriodIds": {"value": [period]}}})},
                    timeout=8)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list):
                    data = data[0]
            return day, count_day(data, day, period, league.year, teams)
        except Exception:
            # Never expose request objects, cookie values or raw private data.
            return day, None
    days = list(range(first_day, last_day + 1))
    # Prioritize current/recent days if the bounded season backfill runs out of time.
    with ThreadPoolExecutor(max_workers=4) as pool:
        daily = dict(pool.map(fetch, reversed(days)))
    rows = []
    for team, name in teams.items():
        row = {"team_id": team, "team_name": name}
        for label, period in (("season", None), ("current", current), ("previous", current - 1)):
            selected = days if period is None else [d for d in days if periods.get(d) == period]
            count = missing = uncertain = 0
            for day in selected:
                result = (daily[day] or {}).get(team)
                if not result or not result["available"]:
                    missing += 1
                else:
                    count += result["count"]
                    uncertain += result["uncertain"]
            row[label] = {"count": count, "days": len(selected), "missingDays": missing,
                          "uncertainEntries": uncertain, "complete": missing == 0 and uncertain == 0 and bool(selected)}
        rows.append(row)
    return {"fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "currentMatchupPeriod": current, "firstScoringPeriod": first_day, "throughScoringPeriod": last_day,
            "teams": rows, "unmappedDays": [d for d in days if d not in periods]}
