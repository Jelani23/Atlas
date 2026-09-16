const { atlasState } = require('../core/atlasState');

// Render each owner's evidence separately. The model must not complete the
// user's preference list using Alice's tastes or earlier assistant guesses.
function resolvePreferenceComparison(input, memory = {}, toolResult = {}, profile = atlasState) {
    if (toolResult.needsTool) return null;
    const text = String(input || '').toLowerCase().trim().replace(/[?,!.]/g, '').replace(/\s+/g, ' ');
    const match = text.match(/^(?:what|which) (games|music|artists) do (i|you) (?:like|love|enjoy|prefer) and (?:what|which) \1 do (i|you) (?:like|love|enjoy|prefer)$/);
    if (!match || match[2] === match[3]) return null;
    const topic = match[1];
    const keyPattern = topic === 'games' ? /\b(?:games?|gaming)\b/i
        : topic === 'artists' ? /\b(?:artists?|idols?|bands?|singers?)\b/i
            : /\b(?:music|artists?|idols?|bands?|songs?|singers?|genres?)\b/i;
    const rows = (memory.personal || []).filter(row => {
        const key = String(row.key || '').replace(/_/g, ' ');
        return keyPattern.test(key) && /\b(?:favou?rite\w*|preferences?|likes?|enjoy\w*|interests?)\b/i.test(key);
    });
    const values = [...new Set(rows.map(row => String(row.value || '').trim()).filter(Boolean))];
    const user = memory.profileCoverage?.status === 'unavailable'
        ? "I couldn't load your saved preferences."
        : values.length ? `Your saved ${topic} preferences say: ${values.map(value => `“${value}”`).join('; ')}.`
            : `I don't have your ${topic} preferences in the records available here.`;
    const prefixes = topic === 'games' ? /^(?:games|strategy):/ : topic === 'artists' ? /^idols:/ : /^(?:music|idols):/;
    const own = profile.preferences.enjoys.filter(value => prefixes.test(value)).map(value => value.replace(/^[^:]+:\s*/, ''));
    return `${user} ${own.length ? `As for me, I enjoy ${own.join('; ')}.` : `I don't have established ${topic} preferences in my profile.`}`;
}

module.exports = { resolvePreferenceComparison };
