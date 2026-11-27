const { platform } = require('node:os');
const osLabel = value => ({ win32: 'Windows', windows: 'Windows', darwin: 'macOS', macos: 'macOS', linux: 'Linux', ios: 'iOS', watchos: 'watchOS' })[value] || 'an unspecified operating system';
function deviceAnswer(text, interaction) {
    const value = String(text).trim().replace(/[?!]+$/, '');
    if (!/^(?:(?:can|could) you (?:tell me )?)?(?:which|what) (?:device|computer) am i using(?:,? and where (?:is )?(?:your|the) backend (?:running|hosted))?$/i.test(value)
        && !/^where (?:is )?(?:your|the) backend (?:running|hosted)$/i.test(value)) return null;
    const host = `The backend runs on ${osLabel(platform())}.`;
    if (/^where/i.test(value)) return host;
    const client = interaction?.client;
    if (!client) return `I don’t have a registered client device for this message. ${host}`;
    const label = String(client.displayName || 'this device').replace(/[\r\n]/g, ' ').slice(0, 100);
    return `You’re using ${label}, registered as ${osLabel(client.os)}${client.clientType === 'electron' ? ' through the Electron desktop app' : ''}. ${host}`;
}
function failureAnswer(result, userInput = '') {
    if (/\b(?:debug|technical|details|full|exact|error message)\b/i.test(userInput)) return null;
    const raw = String(result.fallback.display || '');
    if (result.task === 'espnFantasy') {
        if (/^ESPN denied access\./.test(raw)) return 'ESPN denied access, so I couldn’t retrieve current league data. The saved ESPN sign-in needs to be refreshed.';
        if (/^(?:ESPN data could not be fetched|The ESPN request failed or timed out|The ESPN bridge returned an invalid response)/.test(raw))
            return 'I couldn’t retrieve current ESPN data. I don’t have a fresh league update to give you; please try again.';
        if (/^Set ESPN_LEAGUE_ID/.test(raw)) return 'The ESPN league connection still needs its league ID and season configured before I can fetch your data.';
    }
    return null;
}
function personaAnswer(text, profile) {
    // A configured interest is not evidence for invented song titles or group
    // membership. Handle this narrow missing-preference case before streaming.
    if (!/^(?:do you have(?: any)?|what (?:are|is) your|what's your|which are your)\b.*\bfavou?rite\b.*\b(?:songs?|tracks?|idols?|members?)\b[^;]*[?.!]?$/i.test(String(text).trim())) return null;
    if (/\b(?:search|look up|find|calculate|delete|read|write)\b/i.test(text)) return null;
    const preferences = profile?.preferences;
    if (!Array.isArray(preferences?.enjoys)) return null;
    if (/favorite.?songs|favorite.?idols|songs?:|tracks?:|members?:/i.test(JSON.stringify(preferences))) return null;
    const names = preferences.enjoys.filter(item => /^idols?:/i.test(item)).flatMap(item => item.replace(/^[^:]+:\s*/, '').split(/,\s*/))
        .filter(name => name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
    if (!names.length) return null;
    return `I’m partial to ${names.join(' and ')}, but I haven’t settled on a specific song or member to call my favorite.`;
}
module.exports = { deviceAnswer, failureAnswer, personaAnswer };
