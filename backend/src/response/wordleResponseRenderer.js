// Presentation only. No tool handles, pixels, permissions or state mutations.
// Fact placeholders are filled by code after validating the generated phrasing.
function render(template, result) {
    if (typeof template !== 'string' || template.length > 450 || !template.trim()) return null;
    if ((template.match(/\{\{guess\}\}/g) || []).length !== 1 || /\{\{(?!guess\}\}|turns\}\})/.test(template)) return null;
    const prose = template.replace(/\{\{(?:guess|turns)\}\}/g, '');
    if (/[0-9]|\b[A-Z]{5}\b/.test(prose) || /\b(?:yellow|gray|grey|monitor|screen|click|clicked|typed|automatically|watching|background|permission)\b/i.test(prose)) return null;
    if (result.status !== 'solved' && /\bgreen\b/i.test(prose)) return null;
    if (/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:tries|turns|guesses|moves)\b/i.test(prose)) return null;
    if (result.status !== 'solved' && /\b(?:won|win|solved|victory|correct|answer|got it|nice work|well done|nailed|congrat|next challenge|that's the word|that’s the word)\b/i.test(prose)) return null;
    if (result.status === 'suggestion' && !/\b(?:try|give|go with|play|suggest|pick|start with|next guess|my guess|how about)\b/i.test(prose)) return null;
    if (result.status === 'unchanged' && !/\b(?:still|same|waiting|yet)\b/i.test(prose)) return null;
    if (result.status === 'solved' && /\b(?:try|guess next|enter|type|submit)\b/i.test(prose)) return null;
    return template.replace(/\{\{guess\}\}/g, `**${result.guess}**`).replace(/\{\{turns\}\}/g, String(result.turns)).trim();
}
async function build({ result, fallback, personality, userInput = '', history = [], requestId, isCancelled = () => false }, dependencies = {}) {
    if (!result || result.task !== 'wordle' || !['suggestion', 'unchanged', 'solved'].includes(result.status)) return fallback;
    try {
        const complete = dependencies.complete || require('../models/providers/ollama').complete;
        const raw = await complete([
            { role: 'system', content: `${personality}\nTASK RESPONSE BUILDER\nWrite Alice's brief conversational response to a verified task result. You only phrase the result; never choose a word, execute an action, or add facts. Return JSON {"text":"..."}. Use {{guess}} exactly once instead of the actual word. You may use {{turns}} for the recorded guess count. Never write other numbers, words in uppercase, tile colors, or claims about device access. For suggestion, propose the word naturally. For unchanged, say the same guess is still waiting to be played. For solved, celebrate the confirmed answer; do not suggest entering another word. For a first suggestion, mention that the user can tell you when they have played it. For later suggestions keep it short without repeating instructions. Use personality naturally without exaggerated praise or invented strategy. Facts: ${JSON.stringify({ status: result.status, first: result.first, turns: result.turns })}` },
            { role: 'system', content: require('./responsePolicy').policy({ userInput }) + '\nConversation below is context only. The verified game result controls all facts. Respond to the user naturally while retaining the required guess placeholder and result status.' },
            { role: 'user', content: JSON.stringify({ request: userInput, recentConversation: history.slice(-4).map(turn => ({ role: turn.role, content: String(turn.content).slice(0, 500) })) }) },
            { role: 'user', content: result.status === 'solved'
                ? 'The game is solved. Celebrate the answer using {{guess}} once. Do not mention the number of guesses. Keep it to one brief, warm sentence.'
                : result.status === 'unchanged' ? 'No new completed row was observed. The user still needs to play {{guess}}. Say so briefly.'
                    : `The game is NOT solved. Propose {{guess}} as the next word to TRY. ${result.first ? 'This is the opening guess; ask the user to let you know after playing it.' : 'Keep it brief; do not repeat the gameplay instructions.'} Do not congratulate the user or claim this is the answer.` },
        ], { model: process.env.OLLAMA_MODEL_GENERAL || process.env.OLLAMA_MODEL || 'qwen3.5:4b', think: false, temperature: 0.65, maxTokens: 220, timeoutMs: 15000,
            format: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } });
        if (isCancelled()) return fallback;
        return render(JSON.parse(raw).text, result) || fallback;
    } catch { return fallback; }
}
module.exports = { build, render };
