// backend/src/events/eventLogger.js
const { eventBus } = require('./eventBus');
const EventTypes = require('./eventTypes');

function logEvent(type, payload) {
    // Keep logs concise
    const summary = JSON.stringify(payload).substring(0, 120);
    // console.log(`[EventBus] ${type} - ${summary}`);
}

function initialize() {
    // console.log('[EventLogger] Initializing debug logger...');
    Object.values(EventTypes).forEach(type => {
        eventBus.on(type, (payload) => logEvent(type, payload));
    });
}

module.exports = { initialize };