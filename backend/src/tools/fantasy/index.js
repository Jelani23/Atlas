const integration = require('../../integrations/espnFantasy');

// Explicit commands are deterministic; conversational intent is resolved with history.
const parseRequest = require('../../integrations/espnFantasyIntent').explicitAction;

module.exports = {
    espnFantasy: {
        execute: integration.execute,
        intentSchema: {
            name: 'espnFantasy', domain: 'FANTASY_BASKETBALL',
            description: 'Read ESPN fantasy basketball data, played_games (actual active player-games for every team, season/current/previous week), or run deterministic snapshot, league_analysis, optimize_lineup, forecast, waiver_scout, trade_scout, evaluate_trade calculations. Overview includes played_games. Optional parameters JSON has window current/next and give/receive player-name arrays for trade evaluation. Projections are scenarios; no roster changes or transaction submissions. Credentials are local, never tool arguments.',
            triggers: ['fantasy basketball', 'fantasy nba', 'espn fantasy'],
            requiredEntities: [], matchesRequest: message => parseRequest(message) !== null,
            extractParams: message => {
                const request=require('../../integrations/espnFantasyIntent').explicitRequest(message);
                return request?.parameters ? [request.actions[0],JSON.stringify(request.parameters)] : [request?.actions[0] || 'overview'];
            },
            examples: ['Fantasy NBA: overview', 'Show my fantasy basketball roster', 'ESPN: standings']
        }
    },
};
// Kept separate from enumerable tool exports.
Object.defineProperty(module.exports, 'parseRequest', { value: parseRequest });
