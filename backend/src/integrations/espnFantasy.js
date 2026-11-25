const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { AsyncLocalStorage } = require('node:async_hooks');
const snapshotScope = new AsyncLocalStorage();
function withSnapshot(fn) { return snapshotScope.run(new Map(), fn); }
function fetchSnapshot(config, bridge) {
    const cache = snapshotScope.getStore();
    const key = JSON.stringify([config.leagueId,config.season,config.teamId,config.python]);
    if (!cache) return bridge(config,'snapshot');
    if (!cache.has(key)) cache.set(key,Promise.resolve().then(()=>bridge(config,'snapshot')));
    return cache.get(key);
}

const ANALYSIS_ACTIONS = ['snapshot','league_analysis','optimize_lineup','forecast','waiver_scout','trade_scout','evaluate_trade'];
const ACTIONS = ['overview', 'standings', 'roster', 'injuries', 'league_injuries', 'matchup', 'free_agents', 'played_games', ...ANALYSIS_ACTIONS];
const root = path.resolve(__dirname, '../../..');
const errors = {
    AUTH_REQUIRED: 'ESPN denied access. Add or refresh ESPN_S2 and ESPN_SWID in backend/.env, then restart Atlas. Keep cookie values out of chat.',
    INVALID_LEAGUE: 'ESPN could not find this league for the configured season. Check ESPN_LEAGUE_ID and ESPN_SEASON.',
    DEPENDENCY_MISSING: 'Install the ESPN integration requirements first; see docs/espn-fantasy-basketball.md.',
    TEAM_NOT_FOUND: 'ESPN_TEAM_ID does not match a team in this league. Check the league and team configuration.',
    ESPN_FETCH_FAILED: 'ESPN data could not be fetched. Check the league ID, season, network, and ESPN_S2/ESPN_SWID cookies for a private league. No current data was retrieved.'
};

function configuration(env = process.env) {
    const positive = value => /^\d+$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
    if (!positive(env.ESPN_LEAGUE_ID) || !positive(env.ESPN_SEASON) || Number(env.ESPN_SEASON) < 2019 || Number(env.ESPN_SEASON) > 2100) {
        throw new Error('Set ESPN_LEAGUE_ID and ESPN_SEASON (season ending year) in backend/.env. See docs/espn-fantasy-basketball.md.');
    }
    if (env.ESPN_TEAM_ID && !positive(env.ESPN_TEAM_ID)) throw new Error('ESPN_TEAM_ID must be a positive integer.');
    const local = path.join(root, '.venv-espn', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    return { leagueId: Number(env.ESPN_LEAGUE_ID), season: Number(env.ESPN_SEASON),
        teamId: env.ESPN_TEAM_ID ? Number(env.ESPN_TEAM_ID) : null,
        python: env.ESPN_PYTHON || (fs.existsSync(local) ? local : 'python') };
}

function runBridge(config, action) {
    return new Promise((resolve, reject) => {
        const child = execFile(config.python, [path.join(root, 'backend/integrations/espn/bridge.py')], {
            timeout: ['overview','played_games'].includes(action) ? 100000 : 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
            env: process.env, encoding: 'utf8'
        }, (error, stdout) => {
            if (error) return reject(new Error(error.code === 'ENOENT'
                ? 'ESPN Python was not found. Install the integration or set ESPN_PYTHON to its executable.'
                : 'The ESPN request failed or timed out. No current data was retrieved.'));
            try { resolve(JSON.parse(stdout)); }
            catch { reject(new Error('The ESPN bridge returned an invalid response. No current data was retrieved.')); }
        });
        child.stdin.on('error', () => {});
        child.stdin.end(JSON.stringify({ leagueId: config.leagueId, season: config.season, teamId: config.teamId, action }));
    });
}

const { format } = require('./espnFantasyPresenter');

async function query(action = 'overview', { env = process.env, bridge = runBridge, parameters = {} } = {}) {
    if (!ACTIONS.includes(action)) return `ESPN fantasy supports: ${ACTIONS.join(', ')}. This integration only reads league data.`;
    try {
        const config = configuration(env);
        const data = ANALYSIS_ACTIONS.includes(action) ? await fetchSnapshot(config,bridge) : await bridge(config,action);
        if (data.error) return errors[data.error] || errors.ESPN_FETCH_FAILED;
        if (ANALYSIS_ACTIONS.includes(action)) return require('./espnAnalysisPresenter').analyze(data,action,parameters);
        return format(data, action);
    } catch (error) { return error.message; }
}

function execute(action = 'overview', parameters = '{}') {
    try {
        const values = JSON.parse(parameters);
        if (!values || Array.isArray(values) || typeof values !== 'object' || Object.keys(values).some(k=>!['window','give','receive'].includes(k))) throw new Error('Invalid analysis parameters.');
        if (values.window && !['current','next'].includes(values.window)) throw new Error('Choose current or next matchup period.');
        for (const key of ['give','receive']) if (values[key] && (!Array.isArray(values[key]) || values[key].length>3 || values[key].some(v=>typeof v!=='string'||!v.trim()||v.length>100))) throw new Error('Use one to three player names on each side.');
        return query(action,{parameters:values});
    } catch (error) { return Promise.resolve(error.message); }
}
module.exports = { ACTIONS, ANALYSIS_ACTIONS, configuration, runBridge, query, format, execute, withSnapshot, fetchSnapshot };
