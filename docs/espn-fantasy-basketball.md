# Alice's ESPN fantasy basketball integration

This separate, read-only tool uses [cwendt94/espn-api](https://github.com/cwendt94/espn-api) through a bounded Python subprocess. It does not change the other integrations or require database migrations.

## Setup (PowerShell, repository root)

```powershell
python -m venv .venv-espn
.\.venv-espn\Scripts\python.exe -m pip install -r backend/integrations/espn/requirements.txt
```

Set the following in `backend/.env` (ignored by Git), then restart the backend:

```dotenv
ESPN_LEAGUE_ID=1325670339
ESPN_SEASON=2027
ESPN_TEAM_ID=7
```

These IDs come from the supplied Jitters team URL. ESPN seasons use the ending year: 2026–27 is 2027. Change the season explicitly each year; the integration will not silently switch leagues or seasons. Leave the team ID blank to list standings and discover team IDs.

For a private league, log into ESPN in your browser, open developer tools, and locate Cookies for ESPN under Application/Storage. Copy the `espn_s2` cookie value into `ESPN_S2` and `SWID` into `ESPN_SWID` in your local `backend/.env`. Preserve the full values (including SWID braces). Do not paste cookies into Alice, this chat, notes, or source control. Restart the backend after changing configuration. If cookies expire, repeat this process. Public leagues do not require them.

If needed, set `ESPN_PYTHON` to the full Python executable path. By default the bridge uses the repository's isolated `.venv-espn`, then `python` on PATH. Python remains an external prerequisite in a packaged Electron build.

## Use

Ask Alice:

- `Fantasy NBA: overview`
- `Fantasy NBA: standings`
- `Show my fantasy basketball roster`
- `Fantasy NBA: injuries`
- `Fantasy NBA: league injuries`
- `Fantasy NBA: matchup`
- `Fantasy NBA: free agents`
- `Fantasy NBA: games played` (also `Fantasy NBA: stats overview`)

Natural requests use the local model to interpret the intended data view using recent conversation history, before source-code routing. Exact commands remain a model-free fallback. Follow-ups can retain the previous topic and change scope without repeating ESPN or basketball. A league reference without enough basketball context asks for clarification. Other sports, personal injuries, topic changes and explanations are not league lookups. Unsupported changes or interpretation failures return an explicit limitation or clarification, not a claim that ESPN access is missing. The model can still misinterpret an unfamiliar request.

`injuries` means your own roster. `league injuries` means injury flags across every fantasy roster, grouped by fantasy team; it does not include unrostered players or every injury in the NBA. Free agents remain a bounded list of 20 available players, not personalized pickup recommendations. Multiple requested data views can be fetched in one turn.

Player rows retain compact team, position, slot and injury abbreviations on screen and in chat history. The separate TTS presentation expands all 30 professional team abbreviations and basketball positions, and says bench, injured reserve and injury labels naturally. Expansions apply only to structured player rows from the fantasy tool, including its results within multi-tool replies. Ordinary code or prose containing letters such as C or PF is unaffected.

The bridge fetches each result on demand, timestamps it, and restricts output to selected fields. No credentials are accepted as tool arguments or included in results. Network/library errors are sanitized and requests stop after 45 seconds. Points leagues report fantasy points; category leagues report category results and statistics. Roto leagues can use standings and rosters, but not head-to-head matchups. Free agents are limited to 20 in library order; this is not a ranked personalized recommendation.

This version does not run a background monitor, retain historical snapshots, send alerts, or edit lineups, trades, or waivers. A failed fetch is not current league evidence.

### Actual active player-games

The overview includes a league comparison of season-to-date, current-matchup and previous-matchup actual player-games. Ask "How many games has each fantasy team actually played?" or use `Fantasy NBA: games played`. This counts NBA appearances, not fantasy matchups or scheduled games.

`played_games.py` fetches each historical scoring day's `rosterForCurrentScoringPeriod`, uses that day's active lineup slot (IDs 0–11), and counts only actual same-season/game-day records with raw minutes (stat 40) strictly greater than zero. Bench and IR (12/13), zero minutes, empty non-appearance records, projected stats and aggregate matchup totals are excluded. Unique player/game IDs prevent duplicate counting. Current injury labels never override actual recorded minutes, and current roster membership is not used to assign historical appearances. Today’s positive-minute appearances count even if the NBA game is still in progress, so these totals may update with ESPN corrections.

Counts require historical daily roster coverage. Missing days, unknown slots, nonempty stats without usable minutes, or positive-minute records without game IDs produce explicitly partial confirmed totals, not invented zeroes. No snapshots are saved. Requests use up to four concurrent daily reads with eight-second request timeouts and a bounded backfill; recent days are prioritized if a season backfill cannot finish. The overview/played-games process deadline is 100 seconds; other bridge requests remain limited to 45 seconds. This check took about six seconds for 21 scoring days in the configured league. Returned counts include retrieval time.

Injured players include ESPN's estimated return date and calendar days until that estimate when available, plus the reported injury type and update date. The bridge supplements fantasy fields with one public request to [ESPN's NBA injury feed](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries), matched by athlete ID and restricted to the same season. Fantasy cookies are not sent to that public request. The eight-second enrichment timeout or a feed failure leaves the base report available with a notice.

Dates are estimates, not medical clearance or a promise that the player will return that day. Past dates are flagged as outdated, missing dates remain unknown, and explicit no-timetable/indefinite reports mark a listed date as tentative without a countdown. The report shows the structured reason (including rest if ESPN provides it); it never infers rest, a one-game absence, or a season-ending injury merely from OUT. These fields appear in both display text and TTS.

## Deterministic analysis

The new analysis path uses `snapshot.py` to normalize all team rosters, projected and observed season FP/G, ESPN eligibility and lock flags, league slot/position rules, acquisition rules, current live matchup totals, the professional schedule, 50 available-player candidates, and injury enrichment. It strips ownership/account details. A snapshot is a timestamped collection batch, not an atomic ESPN transaction. Multiple analysis actions in one conversation turn reuse that batch; another turn fetches fresh data. No snapshots are persisted automatically.

The local model chooses an operation and optional period/player names. `espnFantasyAnalysis.js` performs the arithmetic and assignment; `espnAnalysisPresenter.js` explains the computed results without asking the model to calculate them.

Analysis speech omits the source timestamp/collection duration, full period dates, routine methodology paragraph and routine injury-feed disclaimer; the display and stored chat retain them. Next-period reports say only "For next week" aloud to keep the planning scope clear. Actual missing-data warnings and result-specific uncertainty remain spoken. Display period labels explicitly say "this week" or "next week". A new unqualified matchup forecast uses the current matchup, even after a next-week lineup discussion; an explicit reference to the same week retains its scope.

Period overrides require a quoted time reference from the current user message; dates in older reports alone cannot set the new request's period. The follow-up regression run passed 41/42 live routing cases, including both current-forecast requests after next-week planning and rejection of an explicit next-week forecast. The remaining mismatch is the previously noted add-player request being treated as read-only scouting.

| Ask Alice | Exact fallback | Default period |
|---|---|---|
| Give me a unified fantasy league snapshot | `Fantasy NBA: snapshot` | Current |
| Which fantasy teams are struggling most with injuries? | `Fantasy NBA: analysis` | Current |
| Build my best fantasy lineup this week | `Fantasy NBA: lineup` | Current |
| Build my best lineup for next week | `Fantasy NBA: lineup next` | Next |
| What do I need to average in the remaining games to win? | `Fantasy NBA: forecast` | Current only |
| Which waiver pickups improve my starting lineup? | `Fantasy NBA: waivers` | Next |
| Find potential fantasy trade opportunities | `Fantasy NBA: trades` | Next |
| Would giving James Harden for a named opponent's player improve my team? | Name both sides conversationally | Next |

Analysis is currently for head-to-head points leagues with weekly first-game locks. Other formats or missing/inconsistent calendars/locks fail explicitly. Calendar dates use ESPN scoring periods, weekly matchup settings and Eastern NBA dates, including short opening weeks and multiweek matchups. The optimizer uses exact slot assignment (not greedy player ranking), prevents duplicate selection, preserves current locked starters and bench, and does not automatically activate IR players. Next-period planning assumes weekly locks reset. Pending roster-change statuses and unimplemented lineup stat/game caps block calculation.

Every player projection uses ESPN projected season FP/G, falling back to the observed season average with disclosure. The conservative scenario assigns injury-flagged players zero future games. The upside scenario allows games on/after a provided tentative return date; absent or explicitly uncertain return dates allow all future games as an optimistic scenario. These are assumptions, not recovery probabilities or guaranteed ranges. Missing rates are counted as zero and disclosed. The chosen lineup maximizes conservative production, then upside to break ties. Bench depth is reported separately and never counted as starting production.

Forecasts add future-game production to already-earned scores. Started games are never projected as full future games. If started games lack final status, or inputs are missing, the response labels totals as partial and withholds a complete final-score/required-average forecast. Team strength rankings refer to future optimized production, not current standings or win probabilities.

Waiver scouting compares one-for-one additions/drops against the best starting lineup, respecting undroppable flags, reported roster position limits and excluding IR drops. It checks at most 50 candidates, ranks by conservative lineup gain, and uses retained bench depth to break ties. Trade scouting compares one-for-one swaps among the top six projected-average non-IR players per team, showing both teams' lineup changes and bench depth. Named trade evaluation supports one to three players per side with equal counts, resolves names uniquely against actual rosters, and rejects wrong ownership or position-limit violations. All trade/waiver results are hypothetical; weekly locks, claim processing, remaining acquisition allowance, trade deadlines and approvals still require ESPN validation. No lineup change, claim or trade is submitted. Results cover the selected matchup period, not rest-of-season player value.

## Checks

```powershell
node --test backend/tests/espnFantasy.test.js
node backend/tests/espnFantasyConversation.test.js
node --test backend/tests/espnFantasyIntent.test.js
node --test backend/tests/espnInjuryTimeline.test.js
node --test backend/tests/espnFantasyAnalysis.test.js
node backend/scripts/evaluateFantasyIntent.js
.\.venv-espn\Scripts\python.exe -m unittest discover -s backend/integrations/espn -p "test_*.py"
node backend/scripts/checkEspnFantasy.js
node backend/scripts/checkEspnAnalysis.js
```

Both checkEspn scripts use local configuration and contact ESPN. The offline tests use fixtures and do not authenticate.

Validation on November 9, 2026: all five analysis views completed against the configured league; calculation, bridge, speech and routing regression tests passed. The latest live local-model intent evaluation passed 38 of 39 cases, including all new analysis requests. One request to actually add a player was interpreted as waiver scouting rather than returning the unsupported-action response. Scouting remains read-only and explicitly says no transaction was submitted. Conversational intent is therefore not perfect; exact commands remain available for repeatable checks.
