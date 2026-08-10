// src/tools/web/getTime.js
async function getTime() {
    const now = new Date();
    return `Local System Time: ${now.toLocaleString('en-US', { timeZoneName: 'short' })}\nUTC Time: ${now.toUTCString()}`;
}

module.exports = {
    execute: getTime,
    intentSchema: {
        name: 'getTime',
        domain: 'TIME',
        triggers: ["time","date"],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};
