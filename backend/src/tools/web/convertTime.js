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
        extractParams: (message, entities) => {
            const zoneMatch = message.match(/\b([a-zA-Z]{2,4})\b(?=\s*$|\s*[\?.!])/i) || message.match(/\bto\s+([a-zA-Z]{2,4})\b/i) || message.match(/time in\s+(.*)/i);
            return [zoneMatch ? zoneMatch[1] : "UTC"];
        }
    }
};
