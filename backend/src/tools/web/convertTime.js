// src/tools/web/convertTime.js
async function convertTime(targetZone) {
    const now = new Date();
    const zoneMap = {
        'JST': 'Asia/Tokyo', 'EST': 'America/New_York', 'EDT': 'America/New_York',
        'CST': 'America/Chicago', 'CDT': 'America/Chicago', 'PST': 'America/Los_Angeles',
        'PDT': 'America/Los_Angeles', 'GMT': 'UTC', 'UTC': 'UTC'
    };
    const upperZone = targetZone.toUpperCase();
    const ianaZone = zoneMap[upperZone] || targetZone;
    try {
        const convertedTime = now.toLocaleString('en-US', { timeZone: ianaZone, timeZoneName: 'short' });
        return `The exact current time in ${upperZone} (${ianaZone}) is ${convertedTime}.`;
    } catch (e) {
        return `Could not convert to timezone ${targetZone}.`;
    }
}

module.exports = {
    execute: convertTime,
    intentSchema: {
        name: 'convertTime',
        domain: 'TIME',
        triggers: ['convert time', 'timezone', 'jst', 'est', 'pst', 'gmt', 'current time in', 'time is it in', 'tell me the time in'],
        requiredEntities: [],
        // Phase: This used to fall back to `\b([a-zA-Z]{2,4})\b(?=\s*$|\s*[\?.!])`,
        // which grabs the LAST short word of literally any sentence ending in
        // punctuation - "...deepest known point on Earth." would happily hand
        // back "Earth" as a "timezone". Now this only extracts a zone when the
        // message actually contains explicit timezone-conversion phrasing
        // ("time in X", "convert to X") or a recognized zone abbreviation as
        // its own word. If neither is present, it returns null so the
        // resolver's null-param penalty keeps this from ever winning on an
        // unrelated message.
        extractParams: (message, entities) => {
            const KNOWN_ZONES = ['JST', 'EST', 'EDT', 'CST', 'CDT', 'PST', 'PDT', 'GMT', 'UTC'];

            const stripFiller = (s) => s.replace(/\s+(right now|now|please|today)\s*$/i, '').trim();

            let m = message.match(/(?:time\s+in|time\s+is\s+it\s+in|current\s+time\s+in)\s+([a-zA-Z\/_\- ]+?)(?:\s*[\?.!]|\s*$)/i);
            if (m && stripFiller(m[1])) return [stripFiller(m[1])];

            m = message.match(/(?:convert(?:\s+the)?\s+time|convert)\s+.*?\bto\s+([a-zA-Z]{2,5})\b/i);
            if (m && m[1].trim()) return [m[1].trim()];

            const zonePattern = new RegExp(`\\b(${KNOWN_ZONES.join('|')})\\b`, 'i');
            const zoneMatch = message.match(zonePattern);
            if (zoneMatch) return [zoneMatch[1]];

            return [null];
        }
    }
};
