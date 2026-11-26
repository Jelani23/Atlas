const { parseVisualWordle } = require('../../../shared/visualWordleIntent');
const state = require('../planner/state');
const { isScreenRequest } = require('../../../shared/screenIntent');

// Physical targeting is taken from the user's words, never invented by the LLM.
function targetFromText(text) {
    const names = { one: 1, two: 2, three: 3, four: 4, first: 1, second: 2, third: 3, fourth: 4 };
    const hits = [...text.matchAll(/\b(?:monitor|screen|display)\s+(?:number\s+)?(\d+|one|two|three|four)\b|\b(first|second|third|fourth)\s+(?:monitor|screen|display)\b/gi)];
    const numbers = hits.map(hit => names[(hit[1] || hit[2]).toLowerCase()] ?? Number(hit[1]));
    const other = /\bother\s+(?:monitor|screen|display)\b/i.test(text);
    const current = /\b(?:this|current)\s+(?:monitor|screen|display)\b/i.test(text);
    if (new Set(numbers).size > 1 || (other && current) || (numbers.length && (other || current))) return { ambiguous: true };
    return { monitor: numbers[0] ?? null, relative: other ? 'other' : current ? 'current' : null };
}

async function resolve(text, { sessionId, interaction, screens }, dependencies = {}) {
    if (typeof text !== 'string' || text.length > 20000) throw new Error('Invalid task message');
    // An explicit screen observation outranks remembered game context. Returning
    // null keeps Electron's ordinary capture and backend screen-analysis path.
    if (isScreenRequest(text)) return null;
    if (/^(?:please\s+)?(?:wordle|connections)\s*:/i.test(text)) return null; // Explicit manual interface.
    const scope = state.runInSession(sessionId, () => state.getSessionScope());
    const focus = scope.taskFocus?.connectionId === interaction.connectionId && Date.now() - scope.taskFocus.at < 30 * 60 * 1000 ? scope.taskFocus : null;
    const active = scope.visualWordle?.connectionId === interaction.connectionId;
    let intent = parseVisualWordle(text);
    if (intent?.action === 'read' && !active) intent = null;
    if (intent?.action === 'stop' && !active && !focus && !/wordle/i.test(text)) intent = null;
    if (!intent && (/\bwordle\b/i.test(text) || ((focus || active) && text.length < 500))) {
        const complete = dependencies.complete || require('../models/providers/ollama').complete;
        try {
            const raw = await complete([
                { role: 'system', content: `Classify the user's CURRENT task request, not quoted examples. You interpret intent only; you cannot execute tools. Return JSON with action (start, read, stop, discuss, other, clarify), target (default, current, other, numbered), monitor (integer 0-16). start means explicitly play/replay Wordle. read means the player submitted a word or asks to check/continue the visible board. stop means cancel/pause this game. discuss is a question about Wordle without requesting capture/play. Unrelated tasks, code changes, hypothetical examples, or negated requests are other. Ambiguity is clarify. "another game" refers to Wordle only when context names Wordle. Never infer a numbered monitor not stated by the user. Context: ${JSON.stringify({ task: focus || active ? 'wordle' : null, active: Boolean(active) })}` },
                { role: 'user', content: text },
            ], { model: process.env.OLLAMA_MODEL_GENERAL || process.env.OLLAMA_MODEL || 'qwen3.5:4b', think: false, temperature: 0, maxTokens: 160, timeoutMs: 20000, format: { type: 'object', additionalProperties: false, required: ['action', 'target', 'monitor'], properties: { action: { enum: ['start', 'read', 'stop', 'discuss', 'other', 'clarify'] }, target: { enum: ['default', 'current', 'other', 'numbered'] }, monitor: { type: 'integer', minimum: 0, maximum: 16 } } } });
            const value = JSON.parse(raw);
            if (!['start', 'read', 'stop', 'discuss', 'other', 'clarify'].includes(value.action) || !['default', 'current', 'other', 'numbered'].includes(value.target)) throw new Error('Invalid task interpretation');
            if (value.action === 'other' || value.action === 'discuss') return { task: 'wordle', action: 'discuss' };
            if ((value.action === 'read' || value.action === 'stop') && !active && !focus) value.action = 'clarify';
            intent = { action: value.action, ...targetFromText(text) };
        } catch { intent = { action: 'clarify' }; }
    }
    if (!intent) return null;
    const reply = message => ({ task: 'wordle', action: 'clarify', reply: message });
    if (intent.ambiguous) return reply('Which single monitor should I use for Wordle?');
    if (intent.action === 'clarify') return reply('Do you want to start another Wordle, check the current board, or stop playing?');
    if (intent.action === 'stop') return { task: 'wordle', action: 'stop' };
    if (!interaction.client?.capabilities?.screenshot?.supported) return reply('Visual Wordle needs the Electron client. For manual feedback, use an explicit “Wordle:” command.');
    const permission = (dependencies.permission || (() => require('../permissions/permissionManager').check('puzzleHelper')))();
    if (!permission.allowed || permission.requiresApproval) return reply('The puzzle helper is unavailable under the current tool permissions.');
    const displays = screens?.displays || [];
    let display;
    if (intent.monitor != null) {
        if (!Number.isSafeInteger(intent.monitor) || intent.monitor < 1 || intent.monitor > displays.length)
            return reply(`This device has ${displays.length} connected screens. Which available monitor should I use?`);
        display = displays[intent.monitor - 1];
    } else if (intent.relative === 'current' || intent.relative === 'other') {
        const current = displays.find(d => d.current) || displays.find(d => d.primary);
        if (intent.relative === 'current') display = current;
        else {
            const others = displays.filter(d => d.id !== current?.id);
            if (others.length !== 1) return reply(`This device has ${displays.length} screens. Which monitor number has Wordle?`);
            display = others[0];
        }
    } else {
        const id = active ? scope.visualWordle.displayId : focus?.displayId;
        display = id ? displays.find(d => d.id === id) : displays.find(d => d.current) || displays.find(d => d.primary) || displays[0];
        if (id && !display) return reply('The previous Wordle monitor is disconnected. Which monitor should I use now?');
    }
    if (!display) return reply('I could not find a connected monitor for Wordle.');
    return { task: 'wordle', action: intent.action === 'read' && !active ? 'start' : intent.action, displayId: display.id };
}
module.exports = { resolve };
