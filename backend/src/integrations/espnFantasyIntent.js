const { ACTIONS } = require('./espnFantasy');
const { extractJSON } = require('../utils/jsonExtractor');

function explicitAction(message) {
    return explicitRequest(message)?.actions[0] || null;
}
function explicitRequest(message) {
    const match = String(message).trim().match(/^(?:espn|fantasy (?:nba|basketball))\s*:\s*([a-z_ ]+?)\s*[.!?]?$/i);
    if (!match) return null;
    let command=match[1].toLowerCase(), window;
    if (/ (?:next|current)$/.test(command)) { window=command.split(' ').pop(); command=command.replace(/ (?:next|current)$/,''); }
    const aliases={ analysis:'league_analysis', lineup:'optimize_lineup', optimize:'optimize_lineup', waivers:'waiver_scout', trades:'trade_scout', 'games played':'played_games', 'stats':'played_games', 'stats overview':'played_games' };
    const action=aliases[command] || command.replace(/ /g,'_');
    if (!ACTIONS.includes(action)) return null;
    return {kind:'read',actions:[action],...(window?{parameters:{window}}:{})};
}
function recentContext(history = []) {
    return history.filter(turn => ['user', 'assistant'].includes(turn.role)).slice(-6)
        .map(turn => ({ role: turn.role, content: String(turn.content || '').slice(0, 1800) }));
}
function shouldInterpret(message, history) {
    // This gate selects the interpreter, not the operation. Once basketball is
    // in recent context even a pronoun-only follow-up can be interpreted.
    return /\b(?:fantasy|espn|basketball|nba|league|roster|standings|waivers|free agents)\b/i.test(message)
        || recentContext(history).some(turn => /\b(?:fantasy|espn|basketball|nba)\b/i.test(turn.content));
}
async function complete(messages, options) {
    const { model, keepAlive } = require('../models/modelRouter').getDefaultModel();
    return require('../models/modelAdapter').createModelAdapter('ollama').complete(messages,
        { model, keepAlive, think: false, temperature: 0, timeoutMs: 20000, ...options });
}
async function interpret(message, history, { completion = complete, requestId } = {}) {
    const raw = await completion([
        { role: 'system', content: require('./espnFantasyIntentPrompt') },
        ...recentContext(history),
        { role: 'user', content: message }
    ], { format: { type: 'object', properties: {
        meaning: { type: 'string' },
        actions: { type: 'array', items: { type: 'string', enum: [...ACTIONS,'other','clarify','unsupported'] }, minItems:1, maxItems: ACTIONS.length },
        parameters: {type:'object',properties:{windowEvidence:{type:'string'},window:{type:'string',enum:['current','next','default']},give:{type:'array',items:{type:'string'},maxItems:3},receive:{type:'array',items:{type:'string'},maxItems:3}},required:['windowEvidence','window','give','receive'],additionalProperties:false}
    }, required: ['meaning', 'actions','parameters'], additionalProperties: false }, maxTokens: 350, requestId: requestId ? `${requestId}:fantasy-intent` : undefined });
    const parsed=extractJSON(raw);
    if (!parsed) return parsed;
    if (parsed.kind) return parsed; // Injectable interpreter fixtures use the normalized contract.
    const special=parsed.actions?.filter(a=>['other','clarify','unsupported'].includes(a));
    if (special?.length) return special.length===1 && parsed.actions.length===1 ? {kind:special[0],actions:[]} : null;
    const parameters={...parsed.parameters};
    // A period override needs a time reference in this request. Historical
    // dates alone must not override the new operation's default period.
    const evidence=parameters.windowEvidence;
    if (typeof evidence!=='string' || !evidence.trim() || !message.toLowerCase().includes(evidence.toLowerCase())) delete parameters.window;
    delete parameters.windowEvidence;
    if(parameters.window==='default') delete parameters.window;
    for(const key of ['give','receive']) if(Array.isArray(parameters[key])&&!parameters[key].length) delete parameters[key];
    return {kind:'read',actions:parsed.actions,parameters};
}
async function resolve(message, history = [], options = {}) {
    // A negated request cannot be revived by earlier affirmative conversation.
    if (/^\s*(?:(?:alice|please)[,\s]+)*(?:don't|don’t|do not|never|stop|cancel)\b/i.test(message)) return null;
    // This integration has no data for other sports. Do not carry basketball
    // context across an explicit sport change, regardless of model output.
    if (/\b(?:football|baseball|hockey|nfl|mlb|nhl|wnba)\b/i.test(message)) return null;
    const explicit = explicitRequest(message);
    if (explicit) return explicit;
    if (!shouldInterpret(message, history)) return null;
    let result;
    try {
        result = await (options.interpret || interpret)(message, history, options);
        if (!result || !['read', 'other', 'clarify', 'unsupported'].includes(result.kind)
            || !Array.isArray(result.actions) || result.actions.length > ACTIONS.length
            || result.actions.some(action => !ACTIONS.includes(action))
            || (result.kind === 'read' ? !result.actions.length : result.actions.length > 0)) throw new Error('Invalid fantasy intent');
    } catch {
        // Do not turn a classifier failure into a false claim of no ESPN access.
        return { kind: 'clarify', actions: [], reply: "I couldn't reliably interpret that request. If you mean fantasy basketball, are you asking about your roster, league standings, available players, injuries, or your matchup?" };
    }
    if (result.kind === 'other') return null;
    const parameters=result.parameters;
    if (parameters) {
        if (typeof parameters!=='object' || Array.isArray(parameters) || Object.keys(parameters).some(k=>!['window','give','receive'].includes(k))
            || (parameters.window && !['current','next'].includes(parameters.window))) return {kind:'clarify',actions:[],reply:'Which matchup period and players should I compare?'};
        const userText=[message,...recentContext(history).filter(t=>t.role==='user').map(t=>t.content)].join(' ').toLowerCase();
        for (const key of ['give','receive']) if (parameters[key] && (!Array.isArray(parameters[key]) || parameters[key].length>3
            || parameters[key].some(name=>typeof name!=='string' || !name.trim() || !userText.includes(name.toLowerCase()))))
            return {kind:'clarify',actions:[],reply:'Please name the players you would give and receive so I can compare the trade.'};
    }
    const anchored = /\b(?:fantasy|espn|basketball|nba)\b/i.test(message)
        || recentContext(history).some(turn => /\b(?:fantasy|espn|basketball|nba)\b/i.test(turn.content));
    if (result.kind === 'read' && !anchored) result = { kind: 'clarify', actions: [] };
    if (result.actions.includes('forecast') && parameters?.window==='next') result={kind:'unsupported',actions:[]};
    if (result.actions.includes('forecast') && /\b(?:tomorrow|today|tonight|daily|single.day)\b/i.test(message))
        return { kind: 'unsupported', actions: [], reply: 'My current forecast covers the whole matchup, not an individual day. I can give you that weekly scenario, but it would not answer your daily projection request.' };
    if (result.kind === 'clarify') return { ...result, reply: 'Do you mean your fantasy basketball team or the whole fantasy league, and which information would you like me to check?' };
    if (result.kind === 'unsupported') return { ...result, reply: 'I can read league data and calculate weekly lineup, matchup, waiver and trade scenarios. I cannot submit roster changes or trades, monitor in the background, or provide that other view through this integration.' };
    const actions = [...new Set(result.actions)].filter(action => !result.actions.includes('overview')
        || !['roster', 'standings', 'matchup', 'played_games'].includes(action));
    return { kind: 'read', actions, ...(parameters && Object.keys(parameters).length ? {parameters} : {}) };
}
module.exports = { resolve, interpret, explicitAction, explicitRequest, shouldInterpret, recentContext };
